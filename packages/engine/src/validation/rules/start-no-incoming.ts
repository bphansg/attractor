import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class StartNoIncomingRule implements LintRule {
  readonly name = 'start-no-incoming';

  apply(graph: Graph): Diagnostic[] {
    const startNode = graph.findStartNode();
    if (!startNode) {
      return [];
    }

    const incoming = graph.incomingEdges(startNode.id);
    if (incoming.length > 0) {
      return incoming.map((edge) => ({
        rule: this.name,
        severity: 'error' as const,
        message: `Start node "${startNode.id}" has an incoming edge from "${edge.from}".`,
        nodeId: startNode.id,
        edge: { from: edge.from, to: edge.to },
        fix: `Remove the edge from "${edge.from}" to the start node.`,
      }));
    }

    return [];
  }
}
