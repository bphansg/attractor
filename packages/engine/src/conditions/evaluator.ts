import type { Outcome } from '../state/outcome.js';
import type { Context } from '../state/context.js';

export function evaluateCondition(
  condition: string,
  outcome: Outcome,
  context: Context,
): boolean {
  const trimmed = condition.trim();
  if (trimmed === '') {
    return true;
  }

  const clauses = trimmed.split('&&').map((c) => c.trim());

  for (const clause of clauses) {
    if (!evaluateClause(clause, outcome, context)) {
      return false;
    }
  }

  return true;
}

function evaluateClause(clause: string, outcome: Outcome, context: Context): boolean {
  // Try != first (must check before = to avoid ambiguity)
  const neqIndex = clause.indexOf('!=');
  if (neqIndex !== -1) {
    const key = clause.slice(0, neqIndex).trim();
    const expected = clause.slice(neqIndex + 2).trim();
    const actual = resolveValue(key, outcome, context);
    return actual !== expected;
  }

  // Try =
  const eqIndex = clause.indexOf('=');
  if (eqIndex !== -1) {
    const key = clause.slice(0, eqIndex).trim();
    const expected = clause.slice(eqIndex + 1).trim();
    const actual = resolveValue(key, outcome, context);
    return actual === expected;
  }

  // No operator found — treat as truthy check on the resolved value
  const value = resolveValue(clause.trim(), outcome, context);
  return value !== '';
}

function resolveValue(key: string, outcome: Outcome, context: Context): string {
  if (key === 'outcome') {
    return outcome.status;
  }
  if (key === 'preferred_label') {
    return outcome.preferredLabel;
  }
  if (key.startsWith('context.')) {
    const contextKey = key.slice('context.'.length);
    // Try with the full key first, then the bare key
    const value = context.get(key) ?? context.get(contextKey);
    return toString(value);
  }
  // Bare key — look up in context
  return toString(context.get(key));
}

function toString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

export function parseCondition(condition: string): { valid: boolean; error?: string } {
  const trimmed = condition.trim();
  if (trimmed === '') {
    return { valid: true };
  }

  const clauses = trimmed.split('&&').map((c) => c.trim());

  for (const clause of clauses) {
    if (clause === '') {
      return { valid: false, error: 'Empty clause found (double &&?)' };
    }

    // Check for valid operator presence
    const neqIndex = clause.indexOf('!=');
    const eqIndex = clause.indexOf('=');

    if (neqIndex === -1 && eqIndex === -1) {
      // No operator — this is a bare key (truthy check), which is acceptable
      continue;
    }

    if (neqIndex !== -1) {
      const key = clause.slice(0, neqIndex).trim();
      const value = clause.slice(neqIndex + 2).trim();
      if (key === '') {
        return { valid: false, error: `Missing key in clause: "${clause}"` };
      }
      if (value === '') {
        return { valid: false, error: `Missing value in clause: "${clause}"` };
      }
    } else if (eqIndex !== -1) {
      const key = clause.slice(0, eqIndex).trim();
      const value = clause.slice(eqIndex + 1).trim();
      if (key === '') {
        return { valid: false, error: `Missing key in clause: "${clause}"` };
      }
      if (value === '') {
        return { valid: false, error: `Missing value in clause: "${clause}"` };
      }
    }
  }

  return { valid: true };
}
