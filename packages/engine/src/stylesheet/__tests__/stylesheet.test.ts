import { describe, it, expect } from 'vitest';
import { parseStylesheet } from '../parser.js';

describe('parseStylesheet', () => {
  it('parses a universal selector', () => {
    const rules = parseStylesheet('* { llm_model: "claude-sonnet-4-20250514"; }');

    expect(rules).toHaveLength(1);
    expect(rules[0].selector.type).toBe('universal');
    expect(rules[0].selector.value).toBe('*');
    expect(rules[0].selector.specificity).toBe(0);
    expect(rules[0].declarations).toEqual([
      { property: 'llm_model', value: 'claude-sonnet-4-20250514' },
    ]);
  });

  it('parses a class selector', () => {
    const rules = parseStylesheet('.fast { llm_model: "gemini-2.5-flash"; }');

    expect(rules).toHaveLength(1);
    expect(rules[0].selector.type).toBe('class');
    expect(rules[0].selector.value).toBe('fast');
    expect(rules[0].selector.specificity).toBe(2);
    expect(rules[0].declarations).toEqual([
      { property: 'llm_model', value: 'gemini-2.5-flash' },
    ]);
  });

  it('parses an ID selector', () => {
    const rules = parseStylesheet('#deep { reasoning_effort: "high"; }');

    expect(rules).toHaveLength(1);
    expect(rules[0].selector.type).toBe('id');
    expect(rules[0].selector.value).toBe('deep');
    expect(rules[0].selector.specificity).toBe(3);
    expect(rules[0].declarations).toEqual([
      { property: 'reasoning_effort', value: 'high' },
    ]);
  });

  it('returns no rules for an empty stylesheet', () => {
    const rules = parseStylesheet('');
    expect(rules).toHaveLength(0);
  });

  it('parses multiple rules', () => {
    const source = `
      * { llm_model: "gpt-4.1"; }
      .fast { llm_model: "gemini-2.5-flash"; reasoning_effort: "low"; }
      #review { reasoning_effort: "high"; }
    `;
    const rules = parseStylesheet(source);
    expect(rules).toHaveLength(3);
  });

  it('ignores unknown properties', () => {
    const rules = parseStylesheet('* { unknown_prop: "value"; }');
    expect(rules).toHaveLength(0); // no valid declarations -> rule is dropped
  });

  it('parses a shape selector', () => {
    const rules = parseStylesheet('box { llm_model: "claude-sonnet-4-20250514"; }');

    expect(rules).toHaveLength(1);
    expect(rules[0].selector.type).toBe('shape');
    expect(rules[0].selector.value).toBe('box');
    expect(rules[0].selector.specificity).toBe(1);
  });
});
