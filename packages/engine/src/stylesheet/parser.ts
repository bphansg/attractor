import type { StyleRule, StyleSelector, StyleDeclaration, SelectorType } from './types.js';

const VALID_PROPERTIES = new Set<StyleDeclaration['property']>([
  'llm_model',
  'llm_provider',
  'reasoning_effort',
]);

/**
 * Parse a CSS-like model stylesheet into an array of StyleRules.
 *
 * Syntax:
 *   * { llm_model: "gpt-4.1"; }
 *   box { llm_model: "claude-sonnet-4-20250514"; }
 *   .fast { llm_model: "gemini-2.5-flash"; reasoning_effort: "low"; }
 *   #review { reasoning_effort: "high"; }
 */
export function parseStylesheet(source: string): StyleRule[] {
  const rules: StyleRule[] = [];
  // Match rule blocks:  selector { declarations }
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(source)) !== null) {
    const rawSelector = match[1].trim();
    const rawBody = match[2].trim();

    const selector = parseSelector(rawSelector);
    if (!selector) {
      continue;
    }

    const declarations = parseDeclarations(rawBody);
    if (declarations.length > 0) {
      rules.push({ selector, declarations });
    }
  }

  return rules;
}

function parseSelector(raw: string): StyleSelector | null {
  if (raw === '*') {
    return { type: 'universal', value: '*', specificity: 0 };
  }

  if (raw.startsWith('#')) {
    const value = raw.slice(1);
    if (!value) return null;
    return { type: 'id', value, specificity: 3 };
  }

  if (raw.startsWith('.')) {
    const value = raw.slice(1);
    if (!value) return null;
    return { type: 'class', value, specificity: 2 };
  }

  // Bare identifier is a shape selector
  if (/^[a-zA-Z_][\w-]*$/.test(raw)) {
    return { type: 'shape' as SelectorType, value: raw, specificity: 1 };
  }

  return null;
}

function parseDeclarations(body: string): StyleDeclaration[] {
  const declarations: StyleDeclaration[] = [];

  // Split on semicolons, filter empties
  const parts = body.split(';').map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) continue;

    const property = part.slice(0, colonIndex).trim();
    let value = part.slice(colonIndex + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (VALID_PROPERTIES.has(property as StyleDeclaration['property'])) {
      declarations.push({
        property: property as StyleDeclaration['property'],
        value,
      });
    }
  }

  return declarations;
}
