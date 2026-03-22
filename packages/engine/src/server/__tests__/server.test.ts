import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../server.js';

const VALID_DOT = `digraph test {
  goal = "Test"
  start [shape=Mdiamond]
  do_thing [prompt="Do it"]
  done [shape=Msquare]
  start -> do_thing -> done
}`;

const INVALID_DOT = `digraph bad {
  goal = "Bad"
  do_thing [prompt="Do it"]
  done [shape=Msquare]
  do_thing -> done
}`;

// Use a random high port to avoid conflicts
let port = 49152 + Math.floor(Math.random() * 10000);

function getPort() {
  return port++;
}

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const body = await res.json();
  return { status: res.status, body };
}

describe('Attractor HTTP Server', () => {
  let server: ReturnType<typeof createServer>;

  afterEach(async () => {
    if (server) await server.stop();
  });

  it('GET /api/v1/health returns ok', async () => {
    const p = getPort();
    server = createServer({ port: p });
    await server.start();

    const { status, body } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/health`);
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.1.0');
    expect(body.activePipelines).toBe(0);
  });

  it('POST /api/v1/pipelines/validate with valid DOT', async () => {
    const p = getPort();
    server = createServer({ port: p });
    await server.start();

    const { status, body } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/pipelines/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dot: VALID_DOT }),
    });

    expect(status).toBe(200);
    expect(body.valid).toBe(true);
  });

  it('POST /api/v1/pipelines/validate with invalid DOT', async () => {
    const p = getPort();
    server = createServer({ port: p });
    await server.start();

    const { status, body } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/pipelines/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dot: INVALID_DOT }),
    });

    expect(status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.diagnostics.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/pipelines/validate rejects missing dot', async () => {
    const p = getPort();
    server = createServer({ port: p });
    await server.start();

    const { status, body } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/pipelines/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(status).toBe(400);
    expect(body.error).toContain('dot');
  });

  it('POST /api/v1/pipelines/run starts a pipeline', async () => {
    const p = getPort();
    server = createServer({ port: p });
    await server.start();

    const { status, body } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/pipelines/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dot: VALID_DOT, autoApprove: true }),
    });

    expect(status).toBe(200);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('running');

    // Wait a bit for pipeline to complete
    await new Promise((r) => setTimeout(r, 500));

    const { body: runBody } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/pipelines/${body.id}`);
    expect(runBody.status).toBe('completed');
    expect(runBody.outcome).toBeDefined();
  });

  it('GET /api/v1/pipelines/:id returns 404 for unknown id', async () => {
    const p = getPort();
    server = createServer({ port: p });
    await server.start();

    const { status } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/pipelines/nonexistent`);
    expect(status).toBe(404);
  });

  it('DELETE /api/v1/pipelines/:id aborts a run', async () => {
    const p = getPort();
    server = createServer({ port: p });
    await server.start();

    // Start a pipeline
    const { body: runBody } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/pipelines/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dot: VALID_DOT, autoApprove: true }),
    });

    const { status, body } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/pipelines/${runBody.id}`, {
      method: 'DELETE',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('aborted');
  });

  it('returns 404 for unknown routes', async () => {
    const p = getPort();
    server = createServer({ port: p });
    await server.start();

    const { status } = await fetchJSON(`http://127.0.0.1:${p}/api/v1/unknown`);
    expect(status).toBe(404);
  });
});
