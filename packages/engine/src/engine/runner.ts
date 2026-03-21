import type { Graph } from '../graph/graph.js';
import type { GraphNode } from '../graph/node.js';
import type { Handler, HandlerRegistry } from '../handlers/interface.js';
import type { Interviewer } from '../interviewer/interface.js';
import type { CodergenBackend } from '../handlers/codergen.js';
import type { Outcome } from '../state/outcome.js';
import type { Checkpoint } from '../state/checkpoint.js';
import { Context } from '../state/context.js';
import { createOutcome } from '../state/outcome.js';
import { createCheckpoint, saveCheckpoint } from '../state/checkpoint.js';
import { selectEdge } from './edge-selection.js';
import { buildRetryPolicy, executeWithRetry } from './retry.js';
import { checkGoalGates, getRetryTarget } from './goal-gates.js';
import { findFailureRoute } from './failure-routing.js';

// ── Event types ──────────────────────────────────────────────────────

export type PipelineEvent =
  | { type: 'node:enter'; node: GraphNode; timestamp: string }
  | { type: 'node:exit'; node: GraphNode; outcome: Outcome; timestamp: string }
  | { type: 'edge:traverse'; from: string; to: string; label: string; timestamp: string }
  | { type: 'pipeline:start'; graphId: string; timestamp: string }
  | { type: 'pipeline:end'; outcome: Outcome; timestamp: string }
  | { type: 'retry'; node: GraphNode; attempt: number; timestamp: string }
  | { type: 'goal-gate:fail'; node: GraphNode; retryTarget: string | null; timestamp: string }
  | { type: 'checkpoint:saved'; currentNode: string; timestamp: string };

// ── RunConfig ────────────────────────────────────────────────────────

export interface RunConfig {
  logsRoot: string;
  handlerRegistry: HandlerRegistry;
  interviewer?: Interviewer;
  codergenBackend?: CodergenBackend;
  onEvent?: (event: PipelineEvent) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function emit(config: RunConfig, event: PipelineEvent): void {
  if (config.onEvent) {
    config.onEvent(event);
  }
}

function now(): string {
  return new Date().toISOString();
}

function isTerminal(node: GraphNode, graph: Graph): boolean {
  return (
    node.nodeType === 'exit' ||
    node.shape === 'Msquare' ||
    graph.outgoingEdges(node.id).length === 0
  );
}

// ── Main run ─────────────────────────────────────────────────────────

export async function run(graph: Graph, config: RunConfig): Promise<Outcome> {
  emit(config, { type: 'pipeline:start', graphId: graph.id, timestamp: now() });

  // INITIALIZE
  const context = new Context();

  // Mirror graph attributes into context
  for (const [key, value] of Object.entries(graph.attrs)) {
    context.set(key, value);
  }
  if (graph.goal) {
    context.set('goal', graph.goal);
  }

  // Find start node
  const startNode = graph.findStartNode();
  if (!startNode) {
    const outcome = createOutcome({
      status: 'fail',
      failureReason: 'No start node found in graph',
    });
    emit(config, { type: 'pipeline:end', outcome, timestamp: now() });
    return outcome;
  }

  const finalOutcome = await executeLoop(graph, config, context, startNode.id, {}, {}, []);

  emit(config, { type: 'pipeline:end', outcome: finalOutcome, timestamp: now() });
  return finalOutcome;
}

// ── Resume from checkpoint ───────────────────────────────────────────

export async function resumeFromCheckpoint(
  graph: Graph,
  config: RunConfig,
  checkpoint: Checkpoint,
): Promise<Outcome> {
  emit(config, { type: 'pipeline:start', graphId: graph.id, timestamp: now() });

  // Restore context
  const context = new Context(checkpoint.contextValues);
  for (const entry of checkpoint.logs) {
    context.appendLog(entry);
  }

  // Restore node retries
  const nodeRetries: Record<string, number> = { ...checkpoint.nodeRetries };

  // Restore completed node outcomes (mark all completed as success unless we have better data)
  const nodeOutcomes: Record<string, Outcome> = {};
  for (const nodeId of checkpoint.completedNodes) {
    nodeOutcomes[nodeId] = createOutcome({ status: 'success' });
  }

  const finalOutcome = await executeLoop(
    graph,
    config,
    context,
    checkpoint.currentNode,
    nodeOutcomes,
    nodeRetries,
    [...checkpoint.completedNodes],
  );

  emit(config, { type: 'pipeline:end', outcome: finalOutcome, timestamp: now() });
  return finalOutcome;
}

// ── Core execution loop ──────────────────────────────────────────────

async function executeLoop(
  graph: Graph,
  config: RunConfig,
  context: Context,
  startNodeId: string,
  nodeOutcomes: Record<string, Outcome>,
  nodeRetries: Record<string, number>,
  completedNodes: string[],
): Promise<Outcome> {
  let currentNodeId = startNodeId;
  let finalOutcome: Outcome = createOutcome({ status: 'success' });

  while (true) {
    const node = graph.getNode(currentNodeId);
    if (!node) {
      return createOutcome({
        status: 'fail',
        failureReason: `Node "${currentNodeId}" not found in graph`,
      });
    }

    // Check for terminal node
    if (isTerminal(node, graph)) {
      emit(config, { type: 'node:enter', node, timestamp: now() });

      // Execute the terminal node's handler (e.g. exit handler)
      let handler: Handler | undefined;
      try {
        handler = config.handlerRegistry.resolve(node);
      } catch {
        // No handler for terminal node — that's OK
      }

      if (handler) {
        const outcome = await handler.execute(node, context, graph, config.logsRoot);
        nodeOutcomes[node.id] = outcome;
        finalOutcome = outcome;
      }

      emit(config, { type: 'node:exit', node, outcome: finalOutcome, timestamp: now() });

      // Check goal gates
      const gateResult = checkGoalGates(graph, nodeOutcomes);
      if (!gateResult.ok && gateResult.failedGate) {
        const retryTarget = getRetryTarget(gateResult.failedGate, graph);
        emit(config, {
          type: 'goal-gate:fail',
          node: gateResult.failedGate,
          retryTarget,
          timestamp: now(),
        });

        if (retryTarget && graph.getNode(retryTarget)) {
          // Retry from target
          currentNodeId = retryTarget;
          continue;
        }

        // No retry target — fail
        return createOutcome({
          status: 'fail',
          failureReason: `Goal gate "${gateResult.failedGate.id}" failed with no retry target`,
        });
      }

      return finalOutcome;
    }

    // Non-terminal node: execute with retry
    emit(config, { type: 'node:enter', node, timestamp: now() });

    let handler: Handler;
    try {
      handler = config.handlerRegistry.resolve(node);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return createOutcome({
        status: 'fail',
        failureReason: message,
      });
    }

    const retryPolicy = buildRetryPolicy(node, graph);
    const outcome = await executeWithRetry(
      handler,
      node,
      context,
      graph,
      config.logsRoot,
      retryPolicy,
    );

    // Record completion
    nodeOutcomes[node.id] = outcome;
    finalOutcome = outcome;
    if (!completedNodes.includes(node.id)) {
      completedNodes.push(node.id);
    }
    nodeRetries[node.id] = (nodeRetries[node.id] ?? 0);

    emit(config, { type: 'node:exit', node, outcome, timestamp: now() });

    // Apply context updates
    if (outcome.contextUpdates && Object.keys(outcome.contextUpdates).length > 0) {
      context.applyUpdates(outcome.contextUpdates);
    }

    // Save checkpoint
    const checkpoint = createCheckpoint(context, currentNodeId, completedNodes, nodeRetries);
    try {
      await saveCheckpoint(checkpoint, config.logsRoot);
      emit(config, { type: 'checkpoint:saved', currentNode: currentNodeId, timestamp: now() });
    } catch {
      // Checkpoint save failure is non-fatal
    }

    // Handle failure
    if (outcome.status === 'fail') {
      const failRoute = findFailureRoute(node, graph, context, outcome);
      if (failRoute) {
        currentNodeId = failRoute;
        continue;
      }
      // No failure route — pipeline terminates
      return outcome;
    }

    // Select next edge
    const edge = selectEdge(node, outcome, context, graph);
    if (!edge) {
      // No edge available — treat as terminal
      return finalOutcome;
    }

    emit(config, {
      type: 'edge:traverse',
      from: edge.from,
      to: edge.to,
      label: edge.label,
      timestamp: now(),
    });

    // Handle loop_restart
    if (edge.loopRestart) {
      // Reset context for the loop iteration but keep node outcomes
      context.appendLog(`Loop restart via edge ${edge.from} -> ${edge.to}`);
    }

    // Advance
    currentNodeId = edge.to;
  }
}
