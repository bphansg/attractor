import { createServer as httpCreateServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseDot } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { validate } from '../validation/index.js';
import { run } from '../engine/runner.js';
import { createDefaultRegistry } from '../handlers/index.js';
import { WaitHumanHandler } from '../handlers/wait-human.js';
import { AutoApproveInterviewer } from '../interviewer/auto-approve.js';
import { generateDot } from '../generate/index.js';
import { ensureRunDirectory, writeManifest } from '../run-dir.js';
import type { PipelineEvent } from '../engine/runner.js';
import type { CodergenBackend } from '../handlers/codergen.js';
import type { GraphNode } from '../graph/node.js';
import type { Context } from '../state/context.js';
import type { PipelineRun } from './http-interviewer.js';
import { HttpInterviewer } from './http-interviewer.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ServerConfig {
  port?: number;
  host?: string;
  logsRoot?: string;
}

// ── Echo backend ─────────────────────────────────────────────────────

class EchoBackend implements CodergenBackend {
  async run(_node: GraphNode, prompt: string, _context: Context): Promise<string> {
    return `[echo] ${prompt}`;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Route matching ───────────────────────────────────────────────────

interface RouteMatch {
  params: Record<string, string>;
}

function matchRoute(pattern: string, path: string): RouteMatch | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return { params };
}

// ── Server ───────────────────────────────────────────────────────────

export function createServer(config: ServerConfig = {}) {
  const port = config.port ?? 3000;
  const host = config.host ?? '0.0.0.0';
  const logsRoot = config.logsRoot ?? join(tmpdir(), 'attractor-server-logs');

  const runs = new Map<string, PipelineRun>();

  // ── Route handlers ───────────────────────────────────────────────

  async function handleRunPipeline(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let parsed: { dot?: string; autoApprove?: boolean };
    try {
      parsed = JSON.parse(body);
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }

    if (!parsed.dot || typeof parsed.dot !== 'string') {
      json(res, 400, { error: 'Missing required field: dot' });
      return;
    }

    // Parse and validate
    let ast;
    try {
      ast = parseDot(parsed.dot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 400, { error: `Parse error: ${message}` });
      return;
    }

    let graph;
    try {
      graph = buildGraph(ast);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 400, { error: `Graph build error: ${message}` });
      return;
    }

    const diagnostics = validate(graph);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      json(res, 400, { error: 'Validation errors', diagnostics: errors });
      return;
    }

    // Create run
    const id = randomUUID();
    const pipelineRun: PipelineRun = {
      id,
      status: 'running',
      events: [],
      sseListeners: new Set(),
    };
    runs.set(id, pipelineRun);

    // Set up run directory
    const runLogsRoot = join(logsRoot, id);
    await ensureRunDirectory(runLogsRoot);
    await writeManifest(runLogsRoot, {
      name: graph.id,
      goal: graph.goal,
      startTime: new Date().toISOString(),
    });

    // Set up backend and registry
    const backend: CodergenBackend = new EchoBackend();
    const registry = createDefaultRegistry(backend);

    // Set up interviewer
    const interviewer = parsed.autoApprove
      ? new AutoApproveInterviewer()
      : new HttpInterviewer(pipelineRun);

    registry.register('wait-human', new WaitHumanHandler(interviewer));
    registry.register('wait.human', new WaitHumanHandler(interviewer));

    // Return immediately, run pipeline in background
    json(res, 200, { id, status: 'running' });

    // Execute pipeline asynchronously
    run(graph, {
      logsRoot: runLogsRoot,
      handlerRegistry: registry,
      interviewer,
      codergenBackend: backend,
      onEvent: (event: PipelineEvent) => {
        const eventData = { ...event } as Record<string, unknown>;
        pipelineRun.events.push(eventData);

        const ssePayload = JSON.stringify(eventData);
        for (const listener of pipelineRun.sseListeners) {
          listener(ssePayload);
        }
      },
    }).then((outcome) => {
      pipelineRun.status = 'completed';
      pipelineRun.outcome = { ...outcome };

      const donePayload = JSON.stringify({ type: 'pipeline:done', outcome, timestamp: new Date().toISOString() });
      for (const listener of pipelineRun.sseListeners) {
        listener(donePayload);
      }
    }).catch((err) => {
      pipelineRun.status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      pipelineRun.outcome = { status: 'fail', failureReason: message };

      const errPayload = JSON.stringify({ type: 'pipeline:error', error: message, timestamp: new Date().toISOString() });
      for (const listener of pipelineRun.sseListeners) {
        listener(errPayload);
      }
    });
  }

  async function handleValidate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let parsed: { dot?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }

    if (!parsed.dot || typeof parsed.dot !== 'string') {
      json(res, 400, { error: 'Missing required field: dot' });
      return;
    }

    try {
      const ast = parseDot(parsed.dot);
      const graph = buildGraph(ast);
      const diagnostics = validate(graph);
      const valid = diagnostics.filter((d) => d.severity === 'error').length === 0;
      json(res, 200, { valid, diagnostics });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 400, {
        valid: false,
        diagnostics: [{ rule: 'parse-error', severity: 'error', message }],
      });
    }
  }

  async function handleGenerate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let parsed: { description?: string; model?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }

    if (!parsed.description || typeof parsed.description !== 'string') {
      json(res, 400, { error: 'Missing required field: description' });
      return;
    }

    try {
      const result = await generateDot({
        description: parsed.description,
        model: parsed.model,
      });
      json(res, 200, { dot: result.dot, diagnostics: result.diagnostics });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: `Generation failed: ${message}` });
    }
  }

  function handleGetPipeline(res: ServerResponse, id: string): void {
    const pipelineRun = runs.get(id);
    if (!pipelineRun) {
      json(res, 404, { error: `Pipeline run not found: ${id}` });
      return;
    }

    json(res, 200, {
      id: pipelineRun.id,
      status: pipelineRun.status,
      events: pipelineRun.events,
      outcome: pipelineRun.outcome,
      pendingQuestion: pipelineRun.pendingQuestion,
    });
  }

  function handleSSE(res: ServerResponse, id: string): void {
    const pipelineRun = runs.get(id);
    if (!pipelineRun) {
      json(res, 404, { error: `Pipeline run not found: ${id}` });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send existing events as replay
    for (const event of pipelineRun.events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Register listener for new events
    const listener = (data: string): void => {
      res.write(`data: ${data}\n\n`);
    };
    pipelineRun.sseListeners.add(listener);

    // Clean up on disconnect
    res.on('close', () => {
      pipelineRun.sseListeners.delete(listener);
    });
  }

  async function handleAnswer(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const pipelineRun = runs.get(id);
    if (!pipelineRun) {
      json(res, 404, { error: `Pipeline run not found: ${id}` });
      return;
    }

    if (pipelineRun.status !== 'waiting_human' || !pipelineRun.resolveAnswer) {
      json(res, 400, { error: 'Pipeline is not waiting for an answer' });
      return;
    }

    const body = await readBody(req);
    let parsed: { value?: string; text?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }

    if (!parsed.value) {
      json(res, 400, { error: 'Missing required field: value' });
      return;
    }

    const answer = { value: parsed.value, text: parsed.text ?? '' };

    // Resolve the pending promise
    pipelineRun.resolveAnswer(answer);
    pipelineRun.resolveAnswer = undefined;
    pipelineRun.pendingQuestion = undefined;
    pipelineRun.status = 'running';

    json(res, 200, { ok: true });
  }

  function handleAbort(res: ServerResponse, id: string): void {
    const pipelineRun = runs.get(id);
    if (!pipelineRun) {
      json(res, 404, { error: `Pipeline run not found: ${id}` });
      return;
    }

    pipelineRun.status = 'aborted';

    // If waiting for human, resolve with a skip to unblock
    if (pipelineRun.resolveAnswer) {
      pipelineRun.resolveAnswer({ value: 'skipped', text: 'Aborted by user' });
      pipelineRun.resolveAnswer = undefined;
      pipelineRun.pendingQuestion = undefined;
    }

    json(res, 200, { ok: true, status: 'aborted' });
  }

  function handleHealth(res: ServerResponse): void {
    let activePipelines = 0;
    for (const r of runs.values()) {
      if (r.status === 'running' || r.status === 'waiting_human' || r.status === 'pending') {
        activePipelines++;
      }
    }
    json(res, 200, { status: 'ok', version: '0.1.0', activePipelines });
  }

  // ── Request router ───────────────────────────────────────────────

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    // CORS preflight
    if (method === 'OPTIONS') {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    setCorsHeaders(res);

    try {
      // Health
      if (method === 'GET' && path === '/api/v1/health') {
        handleHealth(res);
        return;
      }

      // POST /api/v1/pipelines/run
      if (method === 'POST' && path === '/api/v1/pipelines/run') {
        await handleRunPipeline(req, res);
        return;
      }

      // POST /api/v1/pipelines/validate
      if (method === 'POST' && path === '/api/v1/pipelines/validate') {
        await handleValidate(req, res);
        return;
      }

      // POST /api/v1/pipelines/generate
      if (method === 'POST' && path === '/api/v1/pipelines/generate') {
        await handleGenerate(req, res);
        return;
      }

      // GET /api/v1/pipelines/:id/events
      let match = matchRoute('/api/v1/pipelines/:id/events', path);
      if (method === 'GET' && match) {
        handleSSE(res, match.params.id);
        return;
      }

      // POST /api/v1/pipelines/:id/answer
      match = matchRoute('/api/v1/pipelines/:id/answer', path);
      if (method === 'POST' && match) {
        await handleAnswer(req, res, match.params.id);
        return;
      }

      // DELETE /api/v1/pipelines/:id
      match = matchRoute('/api/v1/pipelines/:id', path);
      if (method === 'DELETE' && match) {
        handleAbort(res, match.params.id);
        return;
      }

      // GET /api/v1/pipelines/:id
      match = matchRoute('/api/v1/pipelines/:id', path);
      if (method === 'GET' && match) {
        handleGetPipeline(res, match.params.id);
        return;
      }

      // 404
      json(res, 404, { error: 'Not found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Server error:', message);
      json(res, 500, { error: 'Internal server error' });
    }
  }

  // ── Server lifecycle ─────────────────────────────────────────────

  const server = httpCreateServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('Unhandled error:', err);
      if (!res.headersSent) {
        json(res, 500, { error: 'Internal server error' });
      }
    });
  });

  return {
    start(): Promise<void> {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          console.log(`Attractor server listening on http://${host}:${port}`);
          console.log('');
          console.log('Endpoints:');
          console.log(`  POST   /api/v1/pipelines/run        Start a pipeline`);
          console.log(`  POST   /api/v1/pipelines/validate   Validate DOT`);
          console.log(`  POST   /api/v1/pipelines/generate   Generate DOT from description`);
          console.log(`  GET    /api/v1/pipelines/:id         Get run status`);
          console.log(`  GET    /api/v1/pipelines/:id/events  SSE event stream`);
          console.log(`  POST   /api/v1/pipelines/:id/answer  Answer a human gate`);
          console.log(`  DELETE /api/v1/pipelines/:id         Abort a run`);
          console.log(`  GET    /api/v1/health               Health check`);
          console.log('');
          resolve();
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    get runs() {
      return runs;
    },
  };
}
