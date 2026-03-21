import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Outcome } from '../state/outcome.js';

/**
 * Check all visited nodes that have goalGate=true.
 * If any has a non-success outcome (not 'success' or 'partial_success'),
 * return { ok: false, failedGate }.
 */
export function checkGoalGates(
  graph: Graph,
  nodeOutcomes: Record<string, Outcome>,
): { ok: boolean; failedGate: GraphNode | null } {
  for (const [nodeId, outcome] of Object.entries(nodeOutcomes)) {
    const node = graph.getNode(nodeId);
    if (!node || !node.goalGate) {
      continue;
    }
    if (outcome.status !== 'success' && outcome.status !== 'partial_success') {
      return { ok: false, failedGate: node };
    }
  }
  return { ok: true, failedGate: null };
}

/**
 * Determine the retry target for a failed goal gate.
 *
 * Resolution order:
 * 1. The node's retryTarget
 * 2. The node's fallbackRetryTarget
 * 3. The graph's retryTarget
 * 4. The graph's fallbackRetryTarget
 * 5. null (no retry target available)
 */
export function getRetryTarget(
  failedGate: GraphNode,
  graph: Graph,
): string | null {
  if (failedGate.retryTarget) {
    return failedGate.retryTarget;
  }
  if (failedGate.fallbackRetryTarget) {
    return failedGate.fallbackRetryTarget;
  }
  if (graph.retryTarget) {
    return graph.retryTarget;
  }
  if (graph.fallbackRetryTarget) {
    return graph.fallbackRetryTarget;
  }
  return null;
}
