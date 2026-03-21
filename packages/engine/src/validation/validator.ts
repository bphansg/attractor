import type { Graph } from '../graph/graph.js';
import type { Diagnostic } from './diagnostic.js';
import type { LintRule } from './rule-interface.js';
import { StartNodeRule } from './rules/start-node.js';
import { TerminalNodeRule } from './rules/terminal-node.js';
import { ReachabilityRule } from './rules/reachability.js';
import { EdgeTargetExistsRule } from './rules/edge-target-exists.js';
import { StartNoIncomingRule } from './rules/start-no-incoming.js';
import { ExitNoOutgoingRule } from './rules/exit-no-outgoing.js';
import { ConditionSyntaxRule } from './rules/condition-syntax.js';
import { TypeKnownRule } from './rules/type-known.js';
import { FidelityValidRule } from './rules/fidelity-valid.js';
import { RetryTargetExistsRule } from './rules/retry-target-exists.js';
import { GoalGateHasRetryRule } from './rules/goal-gate-has-retry.js';
import { PromptOnLlmNodesRule } from './rules/prompt-on-llm-nodes.js';

const DEFAULT_RULES: LintRule[] = [
  new StartNodeRule(),
  new TerminalNodeRule(),
  new ReachabilityRule(),
  new EdgeTargetExistsRule(),
  new StartNoIncomingRule(),
  new ExitNoOutgoingRule(),
  new ConditionSyntaxRule(),
  new TypeKnownRule(),
  new FidelityValidRule(),
  new RetryTargetExistsRule(),
  new GoalGateHasRetryRule(),
  new PromptOnLlmNodesRule(),
];

export class ValidationError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    const summary = diagnostics
      .map((d) => `[${d.severity}] ${d.rule}: ${d.message}`)
      .join('\n');
    super(`Validation failed with ${diagnostics.length} error(s):\n${summary}`);
    this.name = 'ValidationError';
  }
}

export function validate(graph: Graph, extraRules?: LintRule[]): Diagnostic[] {
  const rules = extraRules ? [...DEFAULT_RULES, ...extraRules] : DEFAULT_RULES;
  const diagnostics: Diagnostic[] = [];

  for (const rule of rules) {
    diagnostics.push(...rule.apply(graph));
  }

  return diagnostics;
}

export function validateOrRaise(graph: Graph, extraRules?: LintRule[]): void {
  const diagnostics = validate(graph, extraRules);
  const errors = diagnostics.filter((d) => d.severity === 'error');

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}
