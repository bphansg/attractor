import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class TerminalNodeRule implements LintRule {
  readonly name = 'terminal-node';

  apply(graph: Graph): Diagnostic[] {
    const exitNodes = Array.from(graph.nodes.values()).filter(
      (n) => n.shape === 'Msquare' || n.nodeType === 'exit',
    );

    if (exitNodes.length === 0) {
      return [
        {
          rule: this.name,
          severity: 'error',
          message: 'Graph must have exactly one exit node (shape=Msquare or type=exit). None found.',
          fix: 'Add a node with shape="Msquare" or type="exit".',
        },
      ];
    }

    if (exitNodes.length > 1) {
      return exitNodes.map((n) => ({
        rule: this.name,
        severity: 'error' as const,
        message: `Multiple exit nodes found. Node "${n.id}" is one of ${exitNodes.length} exit nodes.`,
        nodeId: n.id,
        fix: 'Ensure only one node has shape="Msquare" or type="exit".',
      }));
    }

    return [];
  }
}
