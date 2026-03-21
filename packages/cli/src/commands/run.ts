import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  parseDot,
  buildGraph,
  validate,
  run,
  createDefaultRegistry,
  CodergenHandler,
  AutoApproveInterviewer,
  ConsoleInterviewer,
  WaitHumanHandler,
  ensureRunDirectory,
  writeManifest,
} from '@attractor/engine';
import type {
  CodergenBackend,
  GraphNode,
  Interviewer,
  PipelineEvent,
  Diagnostic,
  Context,
} from '@attractor/engine';
import { parseArgs } from '../config.js';

/**
 * Echo backend: returns the prompt text as the response.
 * Used when no LLM API keys are available.
 */
class EchoBackend implements CodergenBackend {
  async run(_node: GraphNode, prompt: string, _context: Context): Promise<string> {
    return `[echo] ${prompt}`;
  }
}

function formatEvent(event: PipelineEvent): string {
  const ts = event.timestamp.split('T')[1]?.slice(0, 8) ?? '';
  switch (event.type) {
    case 'pipeline:start':
      return `\x1b[36m[${ts}]\x1b[0m Pipeline started: ${event.graphId}`;
    case 'pipeline:end':
      return `\x1b[36m[${ts}]\x1b[0m Pipeline ended: ${event.outcome.status}`;
    case 'node:enter':
      return `\x1b[33m[${ts}]\x1b[0m >> Entering: ${event.node.id} (${event.node.nodeType || event.node.shape})`;
    case 'node:exit':
      return `\x1b[33m[${ts}]\x1b[0m << Exiting:  ${event.node.id} -> ${event.outcome.status}`;
    case 'edge:traverse':
      return `\x1b[34m[${ts}]\x1b[0m    ${event.from} -${event.label ? `[${event.label}]` : ''}-> ${event.to}`;
    case 'retry':
      return `\x1b[35m[${ts}]\x1b[0m Retry: ${event.node.id} attempt #${event.attempt}`;
    case 'goal-gate:fail':
      return `\x1b[31m[${ts}]\x1b[0m Goal gate failed: ${event.node.id}`;
    case 'checkpoint:saved':
      return `\x1b[90m[${ts}]\x1b[0m Checkpoint saved at: ${event.currentNode}`;
  }
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const d of diagnostics) {
    const color = d.severity === 'error' ? '\x1b[31m' : d.severity === 'warning' ? '\x1b[33m' : '\x1b[34m';
    const reset = '\x1b[0m';
    const location = d.nodeId ? ` (node: ${d.nodeId})` : d.edge ? ` (edge: ${d.edge.from} -> ${d.edge.to})` : '';
    console.error(`${color}[${d.severity}]${reset} ${d.rule}${location}: ${d.message}`);
    if (d.fix) {
      console.error(`         fix: ${d.fix}`);
    }
  }
}

export async function runCommand(args: string[]): Promise<void> {
  const { dotFile, config } = parseArgs(args);
  const filePath = resolve(dotFile);

  // Read and parse DOT file
  let source: string;
  try {
    source = await readFile(filePath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error reading file: ${message}`);
    process.exit(1);
  }

  const ast = parseDot(source);
  const graph = buildGraph(ast);

  // Validate
  const diagnostics = validate(graph);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity !== 'error');

  if (warnings.length > 0) {
    console.error('\nValidation warnings:');
    printDiagnostics(warnings);
    console.error('');
  }

  if (errors.length > 0) {
    console.error('\nValidation errors (aborting):');
    printDiagnostics(errors);
    process.exit(1);
  }

  // Set up logs directory
  const logsRoot = resolve(config.logsDir);
  await ensureRunDirectory(logsRoot);
  await writeManifest(logsRoot, {
    name: graph.id,
    goal: graph.goal,
    startTime: new Date().toISOString(),
  });

  // Create backend
  const backend: CodergenBackend = new EchoBackend();

  // Create handler registry
  const registry = createDefaultRegistry(backend);

  // Set up interviewer
  const interviewer: Interviewer = config.autoApprove
    ? new AutoApproveInterviewer()
    : new ConsoleInterviewer();

  // Re-register wait-human handler with the correct interviewer
  registry.register('wait-human', new WaitHumanHandler(interviewer));
  registry.register('wait.human', new WaitHumanHandler(interviewer));

  console.log(`\nAttractor Pipeline Runner`);
  console.log(`  File:     ${filePath}`);
  console.log(`  Graph:    ${graph.id}`);
  console.log(`  Goal:     ${graph.goal || '(none)'}`);
  console.log(`  Logs:     ${logsRoot}`);
  console.log(`  Mode:     ${config.autoApprove ? 'auto-approve' : 'interactive'}`);
  console.log(`  Backend:  echo (no LLM API keys)`);
  console.log('');

  // Run pipeline
  const outcome = await run(graph, {
    logsRoot,
    handlerRegistry: registry,
    interviewer,
    codergenBackend: backend,
    onEvent: (event) => {
      console.log(formatEvent(event));
    },
  });

  // Print final outcome
  console.log('');
  if (outcome.status === 'success') {
    console.log(`\x1b[32mPipeline completed successfully.\x1b[0m`);
  } else {
    console.log(`\x1b[31mPipeline failed: ${outcome.failureReason || outcome.status}\x1b[0m`);
  }

  if (outcome.notes) {
    console.log(`Notes: ${outcome.notes}`);
  }

  console.log(`Logs written to: ${logsRoot}`);

  process.exit(outcome.status === 'success' ? 0 : 1);
}
