import { describe, it, expect } from 'vitest';
import { evaluateCondition, parseCondition } from '../evaluator.js';
import { createOutcome } from '../../state/outcome.js';
import { Context } from '../../state/context.js';

describe('evaluateCondition', () => {
  it('outcome=success matches a success outcome', () => {
    const outcome = createOutcome({ status: 'success' });
    const ctx = new Context();
    expect(evaluateCondition('outcome=success', outcome, ctx)).toBe(true);
  });

  it('outcome=success does NOT match a fail outcome', () => {
    const outcome = createOutcome({ status: 'fail' });
    const ctx = new Context();
    expect(evaluateCondition('outcome=success', outcome, ctx)).toBe(false);
  });

  it('outcome!=success matches a fail outcome', () => {
    const outcome = createOutcome({ status: 'fail' });
    const ctx = new Context();
    expect(evaluateCondition('outcome!=success', outcome, ctx)).toBe(true);
  });

  it('preferred_label=approved matches when preferredLabel is "approved"', () => {
    const outcome = createOutcome({ status: 'success', preferredLabel: 'approved' });
    const ctx = new Context();
    expect(evaluateCondition('preferred_label=approved', outcome, ctx)).toBe(true);
  });

  it('context.foo=bar matches when context has foo=bar', () => {
    const outcome = createOutcome({ status: 'success' });
    const ctx = new Context();
    ctx.set('foo', 'bar');
    expect(evaluateCondition('context.foo=bar', outcome, ctx)).toBe(true);
  });

  it('outcome=success && context.x=1 requires both to be true', () => {
    const outcome = createOutcome({ status: 'success' });
    const ctx = new Context();
    ctx.set('x', '1');

    expect(evaluateCondition('outcome=success && context.x=1', outcome, ctx)).toBe(true);
    expect(evaluateCondition('outcome=success && context.x=2', outcome, ctx)).toBe(false);
  });

  it('empty condition matches everything', () => {
    const outcome = createOutcome({ status: 'fail' });
    const ctx = new Context();
    expect(evaluateCondition('', outcome, ctx)).toBe(true);
  });
});

describe('parseCondition', () => {
  it('validates correct syntax', () => {
    expect(parseCondition('outcome=success').valid).toBe(true);
    expect(parseCondition('outcome!=fail').valid).toBe(true);
    expect(parseCondition('outcome=success && context.x=1').valid).toBe(true);
  });

  it('accepts empty string as valid', () => {
    expect(parseCondition('').valid).toBe(true);
  });

  it('rejects clause with missing value after =', () => {
    const result = parseCondition('outcome=');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects double && producing empty clause', () => {
    const result = parseCondition('outcome=success && && context.x=1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Empty clause');
  });
});
