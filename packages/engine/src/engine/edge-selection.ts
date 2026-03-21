import type { GraphNode } from '../graph/node.js';
import type { GraphEdge } from '../graph/edge.js';
import type { Graph } from '../graph/graph.js';
import type { Outcome } from '../state/outcome.js';
import type { Context } from '../state/context.js';
import { evaluateCondition } from '../conditions/evaluator.js';

/**
 * Normalize an edge label for comparison: lowercase, trim, and strip
 * accelerator prefixes such as `[Y] `, `Y) `, `Y - `.
 */
export function normalizeLabel(label: string): string {
  let normalized = label.trim().toLowerCase();

  // Strip bracketed accelerator prefix: "[Y] " or "[Yes] "
  normalized = normalized.replace(/^\[[^\]]*\]\s*/, '');

  // Strip parenthesized accelerator prefix: "Y) " or "Yes) "
  normalized = normalized.replace(/^[a-z0-9]+\)\s*/i, '');

  // Strip dash accelerator prefix: "Y - " or "Yes - "
  normalized = normalized.replace(/^[a-z0-9]+\s*-\s*/i, '');

  return normalized;
}

/**
 * Pick the single best edge from a non-empty list: highest weight wins,
 * ties broken by target node ID ascending (lexicographic).
 */
export function bestByWeightThenLexical(edges: GraphEdge[]): GraphEdge {
  let best = edges[0]!;
  for (let i = 1; i < edges.length; i++) {
    const e = edges[i]!;
    if (e.weight > best.weight || (e.weight === best.weight && e.to < best.to)) {
      best = e;
    }
  }
  return best;
}

/**
 * 5-step edge selection algorithm.
 *
 * 1. Get outgoing edges. If none, return null.
 * 2. Condition matching: evaluate non-empty conditions, collect truthy edges.
 *    If any, return the best by weight then lexical.
 * 3. Preferred label: if outcome.preferredLabel is set, find first unconditional
 *    edge whose normalized label matches.
 * 4. Suggested next IDs: if outcome.suggestedNextIds is set, find first
 *    unconditional edge whose target is in the list.
 * 5. Weight/lexical tiebreak among unconditional edges.
 */
export function selectEdge(
  node: GraphNode,
  outcome: Outcome,
  context: Context,
  graph: Graph,
): GraphEdge | null {
  // Step 1: get outgoing edges
  const outgoing = graph.outgoingEdges(node.id);
  if (outgoing.length === 0) {
    return null;
  }

  // Step 2: condition matching
  const conditionalMatches: GraphEdge[] = [];
  for (const edge of outgoing) {
    if (edge.condition.trim() !== '') {
      if (evaluateCondition(edge.condition, outcome, context)) {
        conditionalMatches.push(edge);
      }
    }
  }
  if (conditionalMatches.length > 0) {
    return bestByWeightThenLexical(conditionalMatches);
  }

  // Unconditional edges for steps 3-5
  const unconditional = outgoing.filter((e) => e.condition.trim() === '');
  if (unconditional.length === 0) {
    // All edges have conditions and none matched
    return null;
  }

  // Step 3: preferred label
  if (outcome.preferredLabel) {
    const normalizedPreferred = normalizeLabel(outcome.preferredLabel);
    const match = unconditional.find(
      (e) => e.label && normalizeLabel(e.label) === normalizedPreferred,
    );
    if (match) {
      return match;
    }
  }

  // Step 4: suggested next IDs
  if (outcome.suggestedNextIds.length > 0) {
    const idSet = new Set(outcome.suggestedNextIds);
    const match = unconditional.find((e) => idSet.has(e.to));
    if (match) {
      return match;
    }
  }

  // Step 5: weight then lexical tiebreak among unconditional
  return bestByWeightThenLexical(unconditional);
}
