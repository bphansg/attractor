import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

export class RetryTargetExistsRule implements LintRule {
  readonly name = 'retry-target-exists';

  apply(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Check graph-level retry targets
    if (graph.retryTarget && !graph.nodes.has(graph.retryTarget)) {
      diagnostics.push({
        rule: this.name,
        severity: 'warning',
        message: `Graph retry_target "${graph.retryTarget}" does not reference an existing node.`,
        fix: `Add a node with id="${graph.retryTarget}" or correct the retry_target.`,
      });
    }

    if (graph.fallbackRetryTarget && !graph.nodes.has(graph.fallbackRetryTarget)) {
      diagnostics.push({
        rule: this.name,
        severity: 'warning',
        message: `Graph fallback_retry_target "${graph.fallbackRetryTarget}" does not reference an existing node.`,
        fix: `Add a node with id="${graph.fallbackRetryTarget}" or correct the fallback_retry_target.`,
      });
    }

    // Check node-level retry targets
    for (const node of graph.nodes.values()) {
      if (node.retryTarget && !graph.nodes.has(node.retryTarget)) {
        diagnostics.push({
          rule: this.name,
          severity: 'warning',
          message: `Node "${node.id}" retry_target "${node.retryTarget}" does not reference an existing node.`,
          nodeId: node.id,
          fix: `Add a node with id="${node.retryTarget}" or correct the retry_target.`,
        });
      }

      if (node.fallbackRetryTarget && !graph.nodes.has(node.fallbackRetryTarget)) {
        diagnostics.push({
          rule: this.name,
          severity: 'warning',
          message: `Node "${node.id}" fallback_retry_target "${node.fallbackRetryTarget}" does not reference an existing node.`,
          nodeId: node.id,
          fix: `Add a node with id="${node.fallbackRetryTarget}" or correct the fallback_retry_target.`,
        });
      }
    }

    return diagnostics;
  }
}
