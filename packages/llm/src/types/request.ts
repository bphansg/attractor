/**
 * @attractor/llm — Request Types
 *
 * Defines the unified request structure sent to any LLM provider.
 */

import type { Message } from './message.js';
import type { Tool, ToolChoice } from './tool.js';

/** Describes the desired response format from the model. */
export interface ResponseFormat {
  /** The format type. */
  type: 'text' | 'json_object' | 'json_schema';
  /** JSON Schema for structured output (used with 'json_schema' type). */
  schema?: Record<string, unknown>;
  /** A name for the schema (used with 'json_schema' type). */
  name?: string;
  /** Whether to enforce strict schema adherence. */
  strict?: boolean;
}

/** Unified request to send to any LLM provider. */
export interface Request {
  /** The model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514", "gemini-2.0-flash"). */
  model: string;
  /** The conversation messages. */
  messages: Message[];
  /** Tools available for the model to call. */
  tools?: Tool[];
  /** Controls how the model selects tools. */
  toolChoice?: ToolChoice;
  /** Maximum number of tokens to generate. */
  maxTokens?: number;
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** Nucleus sampling parameter (0–1). */
  topP?: number;
  /** Stop sequences that halt generation. */
  stop?: string[];
  /** Reasoning effort hint for models that support it. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Desired response format. */
  responseFormat?: ResponseFormat;
  /** Provider name override — used to route to a specific provider. */
  provider?: string;
  /** Arbitrary provider-specific options. */
  providerOptions?: Record<string, unknown>;
}
