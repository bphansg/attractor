import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class EdgeTargetExistsRule implements LintRule {
  readonly name = 'edge-target-exists';

  apply(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const edge of graph.edges) {
      if (!graph.nodes.has(edge.from)) {
        diagnostics.push({
          rule: this.name,
          severity: 'error',
          message: `Edge source "${edge.from}" does not reference an existing node.`,
          edge: { from: edge.from, to: edge.to },
          fix: `Add a node with id="${edge.from}" or correct the edge source.`,
        });
      }
      if (!graph.nodes.has(edge.to)) {
        diagnostics.push({
          rule: this.name,
          severity: 'error',
          message: `Edge target "${edge.to}" does not reference an existing node.`,
          edge: { from: edge.from, to: edge.to },
          fix: `Add a node with id="${edge.to}" or correct the edge target.`,
        });
      }
    }

    return diagnostics;
  }
}
