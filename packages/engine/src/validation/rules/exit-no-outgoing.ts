import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class ExitNoOutgoingRule implements LintRule {
  readonly name = 'exit-no-outgoing';

  apply(graph: Graph): Diagnostic[] {
    const exitNode = graph.findExitNode();
    if (!exitNode) {
      return [];
    }

    const outgoing = graph.outgoingEdges(exitNode.id);
    if (outgoing.length > 0) {
      return outgoing.map((edge) => ({
        rule: this.name,
        severity: 'error' as const,
        message: `Exit node "${exitNode.id}" has an outgoing edge to "${edge.to}".`,
        nodeId: exitNode.id,
        edge: { from: edge.from, to: edge.to },
        fix: `Remove the edge from the exit node to "${edge.to}".`,
      }));
    }

    return [];
  }
}
