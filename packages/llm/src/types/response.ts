/**
 * @attractor/llm — Response Types
 *
 * Defines the unified response structure returned by any LLM provider.
 */

import type { ContentPart } from './message.js';
import type { ToolCall } from './tool.js';

/** The reason the model stopped generating. */
export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error';

/** Token usage statistics for a request/response cycle. */
export interface Usage {
  /** Number of tokens in the prompt. */
  promptTokens: number;
  /** Number of tokens in the completion. */
  completionTokens: number;
  /** Total tokens (prompt + completion). */
  totalTokens: number;
  /** Tokens used for chain-of-thought reasoning (if applicable). */
  reasoningTokens?: number;
  /** Tokens read from the prompt cache. */
  cacheReadTokens?: number;
  /** Tokens written to the prompt cache. */
  cacheWriteTokens?: number;
}

/** Unified response from any LLM provider. */
export interface Response {
  /** Provider-assigned response identifier. */
  id: string;
  /** The model that generated the response. */
  model: string;
  /** The primary text output, extracted for convenience. */
  text: string;
  /** Full structured content parts from the response. */
  content: ContentPart[];
  /** Tool calls requested by the model. */
  toolCalls: ToolCall[];
  /** The reason generation stopped. */
  finishReason: FinishReason;
  /** Token usage statistics. */
  usage: Usage;
  /** Extracted reasoning/thinking text, if present. */
  reasoning?: string;
  /** Arbitrary provider-specific metadata. */
  providerMetadata?: Record<string, unknown>;
}

/** A non-fatal warning returned alongside a response. */
export interface Warning {
  /** Machine-readable warning code. */
  code: string;
  /** Human-readable warning message. */
  message: string;
}

/** Rate limit information from provider response headers. */
export interface RateLimitInfo {
  /** Maximum requests allowed in the current window. */
  limitRequests?: number;
  /** Maximum tokens allowed in the current window. */
  limitTokens?: number;
  /** Remaining requests in the current window. */
  remainingRequests?: number;
  /** Remaining tokens in the current window. */
  remainingTokens?: number;
  /** When the rate limit window resets. */
  resetAt?: Date;
}
