import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class ReachabilityRule implements LintRule {
  readonly name = 'reachability';

  apply(graph: Graph): Diagnostic[] {
    const startNode = graph.findStartNode();
    if (!startNode) {
      // start-node rule will report this; skip reachability check.
      return [];
    }

    const visited = new Set<string>();
    const queue: string[] = [startNode.id];
    visited.add(startNode.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of graph.outgoingEdges(current)) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push(edge.to);
        }
      }
    }

    const diagnostics: Diagnostic[] = [];
    for (const node of graph.nodes.values()) {
      if (!visited.has(node.id)) {
        diagnostics.push({
          rule: this.name,
          severity: 'error',
          message: `Node "${node.id}" is not reachable from the start node.`,
          nodeId: node.id,
          fix: 'Add an edge path from the start node to this node, or remove it.',
        });
      }
    }

    return diagnostics;
  }
}
