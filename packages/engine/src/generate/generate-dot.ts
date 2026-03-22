import { Client } from '@attractor/llm';
import { parseDot } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { validate } from '../validation/index.js';
import type { Diagnostic } from '../validation/diagnostic.js';
import { GENERATE_SYSTEM_PROMPT } from './prompt.js';

export interface GenerateDotOptions {
  /** Natural language description of the pipeline. */
  description: string;
  /** LLM client instance. If omitted, uses Client.fromEnv(). */
  client?: Client;
  /** Model to use. Defaults to "claude-sonnet-4-20250514". */
  model?: string;
  /** Whether to validate and retry once on failure. Defaults to true. */
  validateOutput?: boolean;
}

export interface GenerateDotResult {
  /** The generated DOT string. */
  dot: string;
  /** Validation diagnostics (empty if clean). */
  diagnostics: Diagnostic[];
}

/**
 * Strips markdown code fences from LLM output if present.
 */
function stripFences(text: string): string {
  let result = text.trim();
  // Remove opening fence like ```dot or ```
  result = result.replace(/^```(?:dot|graphviz)?\s*\n?/, '');
  // Remove closing fence
  result = result.replace(/\n?```\s*$/, '');
  return result.trim();
}

/**
 * Generates a DOT pipeline definition from a natural language description
 * using an LLM.
 */
export async function generateDot(options: GenerateDotOptions): Promise<GenerateDotResult> {
  const client = options.client ?? Client.fromEnv();
  const model = options.model ?? 'claude-sonnet-4-20250514';
  const shouldValidate = options.validateOutput !== false;

  // First attempt
  const response = await client.complete({
    model,
    messages: [
      { role: 'system', content: GENERATE_SYSTEM_PROMPT },
      { role: 'user', content: options.description },
    ],
    maxTokens: 4096,
  });

  let dot = stripFences(response.text);
  let diagnostics: Diagnostic[] = [];

  if (shouldValidate) {
    diagnostics = tryValidate(dot);

    // If validation failed, retry once with error feedback
    const errors = diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      const errorSummary = errors
        .map((d) => `- ${d.message}${d.fix ? ` (fix: ${d.fix})` : ''}`)
        .join('\n');

      const retryResponse = await client.complete({
        model,
        messages: [
          { role: 'system', content: GENERATE_SYSTEM_PROMPT },
          { role: 'user', content: options.description },
          { role: 'assistant', content: dot },
          {
            role: 'user',
            content: `The DOT you generated has validation errors:\n${errorSummary}\n\nPlease fix these errors and output the corrected DOT. Remember: output ONLY the raw DOT code, no fences or commentary.`,
          },
        ],
        maxTokens: 4096,
      });

      dot = stripFences(retryResponse.text);
      diagnostics = tryValidate(dot);
    }
  }

  return { dot, diagnostics };
}

/**
 * Attempts to parse and validate a DOT string.
 * Returns diagnostics, or a synthetic error diagnostic if parsing fails.
 */
function tryValidate(dot: string): Diagnostic[] {
  try {
    const ast = parseDot(dot);
    const graph = buildGraph(ast);
    return validate(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [{
      rule: 'parse-error',
      severity: 'error' as const,
      message: `Failed to parse generated DOT: ${message}`,
    }];
  }
}
