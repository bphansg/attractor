// @attractor/llm — generate()
// High-level function for non-streaming LLM completion.

import type { Request } from '../types/request.js';
import type { Response } from '../types/response.js';
import type { Message } from '../types/message.js';
import { Message as MessageNS } from '../types/message.js';
import type { Tool, ToolCall, ToolResult } from '../types/tool.js';
import type { Client } from '../client.js';
import { getDefaultClient } from '../client.js';
import { runToolLoop } from './tool-loop.js';

// ── Options ───────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  /** The model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514"). */
  model: string;
  /** Conversation messages, or a string shorthand for a single user message. */
  messages: Message[] | string;
  /** Tool definitions available to the model. */
  tools?: Tool[];
  /** Callback to execute tool calls. Required if `tools` is provided and tool loop is desired. */
  executeToolCall?: (toolCall: ToolCall) => Promise<ToolResult>;
  /** Maximum number of tool-use rounds. Defaults to 10. */
  maxToolRounds?: number;
  /** Maximum number of tokens to generate. */
  maxTokens?: number;
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** Reasoning effort hint for models that support it. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Provider name override — routes the request to a specific provider. */
  provider?: string;
  /** Arbitrary provider-specific options. */
  providerOptions?: Record<string, unknown>;
  /** Client instance to use. Falls back to the module-level default client. */
  client?: Client;
  /** Optional callback invoked when the model requests a tool call. */
  onToolCall?: (toolCall: ToolCall) => void;
  /** Optional callback invoked when a tool result is received. */
  onToolResult?: (result: ToolResult) => void;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Generate a completion from an LLM.
 *
 * If `tools` and `executeToolCall` are both provided, runs a multi-step tool
 * loop. Otherwise, performs a single `client.complete()` call.
 */
export async function generate(options: GenerateOptions): Promise<Response> {
  const client = options.client ?? getDefaultClient();
  const messages = normalizeMessages(options.messages);

  const request: Request = {
    model: options.model,
    messages,
    tools: options.tools,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    reasoningEffort: options.reasoningEffort,
    provider: options.provider,
    providerOptions: options.providerOptions,
  };

  // If tools and an executor are provided, use the tool loop.
  if (options.tools && options.executeToolCall) {
    return runToolLoop({
      client,
      request,
      tools: options.tools,
      executeToolCall: options.executeToolCall,
      maxRounds: options.maxToolRounds,
      onToolCall: options.onToolCall,
      onToolResult: options.onToolResult,
    });
  }

  // Single-shot completion.
  return client.complete(request);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a string input to a single user message. */
function normalizeMessages(input: Message[] | string): Message[] {
  if (typeof input === 'string') {
    return [MessageNS.user(input)];
  }
  return input;
}
