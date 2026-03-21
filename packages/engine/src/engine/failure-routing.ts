import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';
import { evaluateCondition } from '../conditions/evaluator.js';

/**
 * Find the failure route for a node whose outcome was 'fail'.
 *
 * Resolution order:
 * 1. Outgoing edge with condition "outcome=fail" that evaluates to true
 * 2. Node's retryTarget
 * 3. Node's fallbackRetryTarget
 * 4. null (pipeline terminates)
 */
export function findFailureRoute(
  node: GraphNode,
  graph: Graph,
  context: Context,
  outcome: Outcome,
): string | null {
  // Step 1: look for a fail edge
  const outgoing = graph.outgoingEdges(node.id);
  for (const edge of outgoing) {
    if (edge.condition.trim() !== '') {
      // Check if this is a fail-routing condition
      if (evaluateCondition(edge.condition, outcome, context)) {
        const condLower = edge.condition.trim().toLowerCase();
        if (condLower === 'outcome=fail') {
          return edge.to;
        }
      }
    }
  }

  // Step 2: node retry_target
  if (node.retryTarget) {
    return node.retryTarget;
  }

  // Step 3: node fallback_retry_target
  if (node.fallbackRetryTarget) {
    return node.fallbackRetryTarget;
  }

  // Step 4: no route
  return null;
}
