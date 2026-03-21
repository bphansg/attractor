import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';
import { createOutcome } from '../state/outcome.js';
import type { Handler } from './interface.js';
import type { Interviewer, Option, Answer } from '../interviewer/interface.js';

/**
 * Parse an accelerator key from an edge label.
 * Supported formats:
 *   [K] Label
 *   K) Label
 *   K - Label
 *   Otherwise: first character of the label
 */
function parseAcceleratorKey(label: string): { key: string; display: string } {
  const trimmed = label.trim();

  // [K] Label
  const bracketMatch = trimmed.match(/^\[(.+?)\]\s*(.*)$/);
  if (bracketMatch) {
    return { key: bracketMatch[1]!, display: bracketMatch[2] || trimmed };
  }

  // K) Label
  const parenMatch = trimmed.match(/^(\S+)\)\s*(.*)$/);
  if (parenMatch) {
    return { key: parenMatch[1]!, display: parenMatch[2] || trimmed };
  }

  // K - Label
  const dashMatch = trimmed.match(/^(\S+)\s*-\s+(.*)$/);
  if (dashMatch) {
    return { key: dashMatch[1]!, display: dashMatch[2] || trimmed };
  }

  // Default: first character
  if (trimmed.length > 0) {
    return { key: trimmed[0]!.toUpperCase(), display: trimmed };
  }

  return { key: '?', display: trimmed };
}

export class WaitHumanHandler implements Handler {
  private interviewer: Interviewer;

  constructor(interviewer: Interviewer) {
    this.interviewer = interviewer;
  }

  async execute(node: GraphNode, context: Context, graph: Graph, _logsRoot: string): Promise<Outcome> {
    // 1. Get outgoing edges to derive choices
    const edges = graph.getOutgoingEdges(node.id);

    if (edges.length === 0) {
      return createOutcome({
        status: 'fail',
        failureReason: 'wait-human node has no outgoing edges',
      });
    }

    // 2. Parse accelerator keys from edge labels
    const usedKeys = new Set<string>();
    const options: Option[] = [];
    const edgeMap = new Map<string, string>(); // key -> target node id

    for (const edge of edges) {
      const edgeLabel = edge.label || edge.to;
      let { key, display } = parseAcceleratorKey(edgeLabel);

      // Deduplicate keys
      while (usedKeys.has(key.toUpperCase())) {
        key = key + '_';
      }
      usedKeys.add(key.toUpperCase());

      options.push({ key, label: display });
      edgeMap.set(key.toUpperCase(), edge.to);
    }

    // 3. Build question with MULTIPLE_CHOICE type
    const questionText = node.prompt || node.label || 'Choose an option:';
    const rawTimeout = node.attrs['human.timeout'];
    const timeoutSeconds = rawTimeout ? parseInt(rawTimeout, 10) : undefined;

    const answer: Answer = await this.interviewer.ask({
      text: questionText,
      type: 'multiple_choice',
      options,
      timeoutSeconds: timeoutSeconds && !isNaN(timeoutSeconds) ? timeoutSeconds : undefined,
      stage: node.id,
      metadata: { nodeId: node.id },
    });

    // 5. Handle TIMEOUT and SKIPPED
    if (answer.value === 'timeout') {
      const defaultChoice = node.attrs['human.default_choice'];
      if (typeof defaultChoice === 'string') {
        const target = edgeMap.get(defaultChoice.toUpperCase());
        if (target) {
          return createOutcome({
            status: 'success',
            preferredLabel: defaultChoice,
            suggestedNextIds: [target],
            contextUpdates: {
              'human.gate.selected': defaultChoice,
              'human.gate.label': 'timeout-default',
            },
          });
        }
      }
      return createOutcome({
        status: 'retry',
        notes: 'Human response timed out',
      });
    }

    if (answer.value === 'skipped') {
      return createOutcome({
        status: 'fail',
        failureReason: 'Human gate was skipped',
      });
    }

    // 6. Find matching choice
    const selectedKey = String(answer.value).toUpperCase();
    const targetId = edgeMap.get(selectedKey);
    const selectedLabel = answer.selectedOption?.label ?? answer.text;

    if (targetId) {
      // 7. Return SUCCESS with preferredLabel and suggestedNextIds
      return createOutcome({
        status: 'success',
        preferredLabel: selectedLabel,
        suggestedNextIds: [targetId],
        contextUpdates: {
          'human.gate.selected': answer.value,
          'human.gate.label': selectedLabel,
        },
      });
    }

    // No matching edge found: return success with the answer but no routing hint
    return createOutcome({
      status: 'success',
      preferredLabel: selectedLabel,
      contextUpdates: {
        'human.gate.selected': answer.value,
        'human.gate.label': selectedLabel,
      },
    });
  }
}
