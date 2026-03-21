// @attractor/llm — generateObject()
// High-level function for structured JSON output from an LLM.

import type { Request } from '../types/request.js';
import type { Response } from '../types/response.js';
import type { Message } from '../types/message.js';
import { Message as MessageNS } from '../types/message.js';
import type { Client } from '../client.js';
import { getDefaultClient } from '../client.js';
import { validateJsonSchema } from '../utils/json-schema.js';
import { NoObjectGeneratedError } from '../errors/index.js';

// ── Options ───────────────────────────────────────────────────────────────────

export interface GenerateObjectOptions<T = unknown> {
  /** The model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514"). */
  model: string;
  /** Conversation messages, or a string shorthand for a single user message. */
  messages: Message[] | string;
  /** JSON Schema that the response must conform to. */
  schema: Record<string, unknown>;
  /** Optional name for the schema (sent to the provider). */
  schemaName?: string;
  /** Maximum number of tokens to generate. */
  maxTokens?: number;
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** Provider name override. */
  provider?: string;
  /** Arbitrary provider-specific options. */
  providerOptions?: Record<string, unknown>;
  /** Client instance to use. Falls back to the module-level default client. */
  client?: Client;
  /** Maximum number of retries on parse/validation failure. Defaults to 2. */
  maxRetries?: number;
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface GenerateObjectResult<T = unknown> {
  /** The parsed and validated object. */
  object: T;
  /** The full provider response. */
  response: Response;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 2;

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Generate a structured JSON object from an LLM.
 *
 * Sets `responseFormat` to `json_schema` with the provided schema, parses the
 * response text as JSON, and validates it against the schema. Retries on
 * parse or validation failure up to `maxRetries` times.
 */
export async function generateObject<T = unknown>(
  options: GenerateObjectOptions<T>,
): Promise<GenerateObjectResult<T>> {
  const client = options.client ?? getDefaultClient();
  const messages = normalizeMessages(options.messages);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  const request: Request = {
    model: options.model,
    messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    provider: options.provider,
    providerOptions: options.providerOptions,
    responseFormat: {
      type: 'json_schema',
      schema: options.schema,
      name: options.schemaName,
      strict: true,
    },
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await client.complete(request);

    // Try to parse the response text as JSON.
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch (parseError) {
      lastError = new NoObjectGeneratedError(
        `Failed to parse response as JSON (attempt ${attempt + 1}/${maxRetries + 1}): ${String(parseError)}`,
        { cause: parseError },
      );
      continue;
    }

    // Validate against the schema.
    const validation = validateJsonSchema(parsed, options.schema);
    if (!validation.valid) {
      lastError = new NoObjectGeneratedError(
        `Response JSON failed schema validation (attempt ${attempt + 1}/${maxRetries + 1}): ${validation.errors.join('; ')}`,
      );
      continue;
    }

    return {
      object: parsed as T,
      response,
    };
  }

  // All attempts exhausted.
  throw lastError;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeMessages(input: Message[] | string): Message[] {
  if (typeof input === 'string') {
    return [MessageNS.user(input)];
  }
  return input;
}
