import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

const VALID_FIDELITY_MODES: ReadonlySet<string> = new Set([
  'full',
  'truncate',
  'compact',
  'summary:low',
  'summary:medium',
  'summary:high',
]);

export class FidelityValidRule implements LintRule {
  readonly name = 'fidelity-valid';

  apply(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Check graph-level default fidelity
    if (graph.defaultFidelity && !VALID_FIDELITY_MODES.has(graph.defaultFidelity)) {
      diagnostics.push({
        rule: this.name,
        severity: 'warning',
        message: `Graph default fidelity "${graph.defaultFidelity}" is not a recognized mode.`,
        fix: `Use one of: ${Array.from(VALID_FIDELITY_MODES).join(', ')}.`,
      });
    }

    // Check node-level fidelity
    for (const node of graph.nodes.values()) {
      if (node.fidelity && !VALID_FIDELITY_MODES.has(node.fidelity)) {
        diagnostics.push({
          rule: this.name,
          severity: 'warning',
          message: `Node "${node.id}" has unrecognized fidelity mode "${node.fidelity}".`,
          nodeId: node.id,
          fix: `Use one of: ${Array.from(VALID_FIDELITY_MODES).join(', ')}.`,
        });
      }
    }

    // Check edge-level fidelity
    for (const edge of graph.edges) {
      if (edge.fidelity && !VALID_FIDELITY_MODES.has(edge.fidelity)) {
        diagnostics.push({
          rule: this.name,
          severity: 'warning',
          message: `Edge "${edge.from}" -> "${edge.to}" has unrecognized fidelity mode "${edge.fidelity}".`,
          edge: { from: edge.from, to: edge.to },
          fix: `Use one of: ${Array.from(VALID_FIDELITY_MODES).join(', ')}.`,
        });
      }
    }

    return diagnostics;
  }
}
