import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

const LLM_TYPES: ReadonlySet<string> = new Set(['codergen']);
const LLM_SHAPES: ReadonlySet<string> = new Set(['rectangle', 'box']);

export class PromptOnLlmNodesRule implements LintRule {
  readonly name = 'prompt-on-llm-nodes';

  apply(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const node of graph.nodes.values()) {
      const isLlmNode =
        LLM_TYPES.has(node.nodeType) ||
        (node.nodeType === '' && LLM_SHAPES.has(node.shape));

      if (!isLlmNode) {
        continue;
      }

      if (!node.prompt && !node.label) {
        diagnostics.push({
          rule: this.name,
          severity: 'warning',
          message: `Codergen node "${node.id}" has neither a prompt nor a label.`,
          nodeId: node.id,
          fix: 'Set a prompt or label attribute so the LLM knows what to do.',
        });
      }
    }

    return diagnostics;
  }
}
