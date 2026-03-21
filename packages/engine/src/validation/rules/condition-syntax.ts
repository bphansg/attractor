import type { Graph } from '../../graph/graph.js';
import { parseCondition } from '../../conditions/evaluator.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class ConditionSyntaxRule implements LintRule {
  readonly name = 'condition-syntax';

  apply(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const edge of graph.edges) {
      if (!edge.condition) {
        continue;
      }

      const result = parseCondition(edge.condition);
      if (!result.valid) {
        diagnostics.push({
          rule: this.name,
          severity: 'error',
          message: `Edge "${edge.from}" -> "${edge.to}" has invalid condition "${edge.condition}": ${result.error}`,
          edge: { from: edge.from, to: edge.to },
          fix: 'Fix the condition syntax. Valid forms: "key=value", "key!=value", "key", joined by "&&".',
        });
      }
    }

    return diagnostics;
  }
}
