// @attractor/llm — streamGenerate()
// High-level function for streaming LLM completion with optional tool loop.

import type { Request } from '../types/request.js';
import type { Response } from '../types/response.js';
import type { StreamEvent } from '../types/stream.js';
import type { Message } from '../types/message.js';
import { Message as MessageNS } from '../types/message.js';
import type { Tool, ToolCall, ToolResult } from '../types/tool.js';
import type { Client } from '../client.js';
import { getDefaultClient } from '../client.js';
import type { GenerateOptions } from './generate.js';

// ── Options ───────────────────────────────────────────────────────────────────

export interface StreamOptions extends GenerateOptions {}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_TOOL_ROUNDS = 10;

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Stream a completion from an LLM, yielding {@link StreamEvent} objects.
 *
 * For a single call (no tools), delegates directly to `client.stream()`.
 * When `tools` and `executeToolCall` are provided, streams each turn of
 * the tool loop, yielding events for every round.
 */
export async function* streamGenerate(
  options: StreamOptions,
): AsyncGenerator<StreamEvent> {
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

  // Simple streaming — no tool loop.
  if (!options.tools || !options.executeToolCall) {
    yield* client.stream(request);
    return;
  }

  // Streaming with tool loop.
  yield* streamToolLoop({
    client,
    request,
    tools: options.tools,
    executeToolCall: options.executeToolCall,
    maxRounds: options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS,
    onToolCall: options.onToolCall,
    onToolResult: options.onToolResult,
  });
}

// ── Stream tool loop ──────────────────────────────────────────────────────────

interface StreamToolLoopConfig {
  client: Client;
  request: Request;
  tools: Tool[];
  executeToolCall: (toolCall: ToolCall) => Promise<ToolResult>;
  maxRounds: number;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
}

async function* streamToolLoop(
  config: StreamToolLoopConfig,
): AsyncGenerator<StreamEvent> {
  const {
    client,
    request,
    tools,
    executeToolCall,
    maxRounds,
    onToolCall,
    onToolResult,
  } = config;

  const messages = [...request.messages];

  for (let round = 0; round < maxRounds; round++) {
    const currentRequest: Request = {
      ...request,
      messages,
      tools,
    };

    // Stream the current turn.
    let response: Response | undefined;

    for await (const event of client.stream(currentRequest)) {
      yield event;

      // Capture the final assembled response from the stream.end event.
      if (event.type === 'stream.end' && event.response) {
        response = event.response;
      }
    }

    // If no response was captured or no tool calls, we're done.
    if (!response || response.toolCalls.length === 0) {
      return;
    }

    // Append the assistant message with tool calls.
    messages.push(MessageNS.assistant(response.content));

    // Execute tool calls.
    const results: ToolResult[] = [];

    for (const toolCall of response.toolCalls) {
      onToolCall?.(toolCall);

      const result = await executeToolCall(toolCall);

      onToolResult?.(result);
      results.push(result);
    }

    // Append tool results.
    messages.push(MessageNS.tool(results));
  }

  // Max rounds reached — final call without tools.
  const finalRequest: Request = {
    ...request,
    messages,
    tools: undefined,
  };

  yield* client.stream(finalRequest);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeMessages(input: Message[] | string): Message[] {
  if (typeof input === 'string') {
    return [MessageNS.user(input)];
  }
  return input;
}
