// @attractor/llm — Tool Loop
// Multi-step tool execution loop shared by generate() and stream().

import type { Client } from '../client.js';
import type { Request } from '../types/request.js';
import type { Response } from '../types/response.js';
import type { Tool, ToolCall, ToolResult } from '../types/tool.js';
import { Message } from '../types/message.js';

// ── Config ────────────────────────────────────────────────────────────────────

export interface ToolLoopConfig {
  /** The client used to send completion requests. */
  client: Client;
  /** The initial request (messages, model, etc.). */
  request: Request;
  /** Tool definitions to pass to the model. */
  tools: Tool[];
  /** Callback that executes a tool call and returns its result. */
  executeToolCall: (toolCall: ToolCall) => Promise<ToolResult>;
  /** Maximum number of tool-use rounds before returning. Defaults to 10. */
  maxRounds?: number;
  /** Optional callback invoked when the model requests a tool call. */
  onToolCall?: (toolCall: ToolCall) => void;
  /** Optional callback invoked when a tool result is received. */
  onToolResult?: (result: ToolResult) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_ROUNDS = 10;

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Run a multi-step tool execution loop.
 *
 * Repeatedly calls `client.complete()` with the provided tools. When the model
 * returns tool calls, they are executed via `executeToolCall`, and the results
 * are appended to the conversation. The loop continues until the model produces
 * a response with no tool calls, or `maxRounds` is reached.
 */
export async function runToolLoop(config: ToolLoopConfig): Promise<Response> {
  const {
    client,
    request,
    tools,
    executeToolCall,
    maxRounds = DEFAULT_MAX_ROUNDS,
    onToolCall,
    onToolResult,
  } = config;

  // Clone messages so we don't mutate the caller's array.
  const messages = [...request.messages];

  for (let round = 0; round < maxRounds; round++) {
    const currentRequest: Request = {
      ...request,
      messages,
      tools,
    };

    const response = await client.complete(currentRequest);

    // If the model didn't request any tool calls, we're done.
    if (response.toolCalls.length === 0) {
      return response;
    }

    // Append the assistant's response (including tool calls) to the conversation.
    messages.push(Message.assistant(response.content));

    // Execute each tool call and collect results.
    const results: ToolResult[] = [];

    for (const toolCall of response.toolCalls) {
      onToolCall?.(toolCall);

      const result = await executeToolCall(toolCall);

      onToolResult?.(result);
      results.push(result);
    }

    // Append tool results as a tool message.
    messages.push(Message.tool(results));
  }

  // Max rounds reached — make one final call without tools to get a summary.
  const finalRequest: Request = {
    ...request,
    messages,
    tools: undefined,
  };

  return client.complete(finalRequest);
}
