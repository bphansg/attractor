import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class StartNodeRule implements LintRule {
  readonly name = 'start-node';

  apply(graph: Graph): Diagnostic[] {
    const startNodes = Array.from(graph.nodes.values()).filter(
      (n) => n.shape === 'Mdiamond' || n.nodeType === 'start',
    );

    if (startNodes.length === 0) {
      return [
        {
          rule: this.name,
          severity: 'error',
          message: 'Graph must have exactly one start node (shape=Mdiamond or type=start). None found.',
          fix: 'Add a node with shape="Mdiamond" or type="start".',
        },
      ];
    }

    if (startNodes.length > 1) {
      return startNodes.map((n) => ({
        rule: this.name,
        severity: 'error' as const,
        message: `Multiple start nodes found. Node "${n.id}" is one of ${startNodes.length} start nodes.`,
        nodeId: n.id,
        fix: 'Ensure only one node has shape="Mdiamond" or type="start".',
      }));
    }

    return [];
  }
}
