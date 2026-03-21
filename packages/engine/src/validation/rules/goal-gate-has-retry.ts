import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class GoalGateHasRetryRule implements LintRule {
  readonly name = 'goal-gate-has-retry';

  apply(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const node of graph.nodes.values()) {
      if (!node.goalGate) {
        continue;
      }

      const hasRetryTarget =
        node.retryTarget !== '' ||
        node.fallbackRetryTarget !== '' ||
        graph.retryTarget !== '' ||
        graph.fallbackRetryTarget !== '';

      if (!hasRetryTarget) {
        diagnostics.push({
          rule: this.name,
          severity: 'warning',
          message: `Node "${node.id}" has goalGate enabled but no retry target configured (node or graph level).`,
          nodeId: node.id,
          fix: 'Set retry_target on the node or on the graph so failed goal-gate checks can retry.',
        });
      }
    }

    return diagnostics;
  }
}
