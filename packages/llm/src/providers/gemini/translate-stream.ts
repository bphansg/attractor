// @attractor/llm — Gemini Stream Translation
// Translates Gemini streaming responses → unified StreamEvent sequence.

import type { StreamEvent } from '../../types/stream.js';
import type { Response, FinishReason, Usage } from '../../types/response.js';
import type { ContentPart } from '../../types/message.js';
import type { ToolCall } from '../../types/tool.js';
import type { SSEEvent } from '../../utils/sse.js';
import type { GeminiResponse, GeminiResponsePart } from './translate-response.js';

// ── State ────────────────────────────────────────────────────────────────────

interface StreamState {
  started: boolean;
  contentStarted: boolean;
  /** Accumulated text across all chunks. */
  fullText: string;
  /** All tool calls accumulated across chunks. */
  toolCalls: ToolCall[];
  /** All content parts for the final response. */
  content: ContentPart[];
  /** Track which tool calls we've already started (by index in the chunk). */
  activeToolCallIndices: Set<number>;
  /** Counter for generating synthetic IDs. */
  callCounter: number;
  /** The latest finish reason seen. */
  finishReason: FinishReason;
  /** The latest usage info. */
  usage: Usage;
  /** Model name from the request. */
  model: string;
}

function createStreamState(model: string): StreamState {
  return {
    started: false,
    contentStarted: false,
    fullText: '',
    toolCalls: [],
    content: [],
    activeToolCallIndices: new Set(),
    callCounter: 0,
    finishReason: 'stop',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model,
  };
}

// ── Main translator ──────────────────────────────────────────────────────────

/**
 * Translate a sequence of Gemini SSE events into unified StreamEvents.
 *
 * When using `alt=sse`, Gemini streams as standard SSE with `data:` fields
 * containing JSON-encoded generateContent response chunks.
 */
export async function* translateStream(
  sseEvents: AsyncGenerator<SSEEvent>,
  model: string,
): AsyncGenerator<StreamEvent> {
  const state = createStreamState(model);

  for await (const sseEvent of sseEvents) {
    // Skip empty data or non-data events.
    if (!sseEvent.data || sseEvent.data === '[DONE]') {
      continue;
    }

    let chunk: GeminiResponse;
    try {
      chunk = JSON.parse(sseEvent.data) as GeminiResponse;
    } catch {
      // Malformed JSON — skip this chunk.
      continue;
    }

    yield* processChunk(chunk, state);
  }

  // Finalize: close any open content/tool calls and emit stream.end.
  yield* finalizeStream(state);
}

// ── Chunk processing ─────────────────────────────────────────────────────────

function* processChunk(chunk: GeminiResponse, state: StreamState): Generator<StreamEvent> {
  // Emit stream.start on first chunk.
  if (!state.started) {
    state.started = true;
    yield { type: 'stream.start' };
  }

  const candidate = chunk.candidates?.[0];
  if (!candidate?.content?.parts) {
    // Update usage/finish reason even if no content parts.
    updateMetadata(chunk, candidate?.finishReason, state);
    return;
  }

  const parts = candidate.content.parts;

  for (const part of parts) {
    yield* processResponsePart(part, state);
  }

  updateMetadata(chunk, candidate.finishReason, state);
}

function* processResponsePart(part: GeminiResponsePart, state: StreamState): Generator<StreamEvent> {
  // Text delta.
  if (part.text !== undefined) {
    if (!state.contentStarted) {
      state.contentStarted = true;
      yield { type: 'content.start', index: 0 };
    }

    state.fullText += part.text;
    yield {
      type: 'content.delta',
      index: 0,
      text: part.text,
    };
  }

  // Function call.
  if (part.functionCall) {
    const callIndex = state.toolCalls.length;
    const toolCall: ToolCall = {
      id: `gemini_call_${Date.now()}_${++state.callCounter}`,
      name: part.functionCall.name,
      arguments: part.functionCall.args ?? {},
    };

    state.toolCalls.push(toolCall);
    state.content.push({ kind: 'tool_call', toolCall });

    // Emit start, delta (with full args as JSON string), and end.
    yield {
      type: 'tool_call.start',
      index: callIndex,
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        arguments: {},
      },
    };

    const argsJson = JSON.stringify(toolCall.arguments);
    yield {
      type: 'tool_call.delta',
      index: callIndex,
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      },
      text: argsJson,
    };

    yield {
      type: 'tool_call.end',
      index: callIndex,
      toolCall,
    };
  }
}

function updateMetadata(
  chunk: GeminiResponse,
  finishReason: string | undefined,
  state: StreamState,
): void {
  if (finishReason) {
    state.finishReason = mapFinishReason(finishReason);
  }

  if (chunk.usageMetadata) {
    const meta = chunk.usageMetadata;
    state.usage = {
      promptTokens: meta.promptTokenCount ?? 0,
      completionTokens: meta.candidatesTokenCount ?? 0,
      totalTokens: meta.totalTokenCount ?? 0,
    };
  }
}

function* finalizeStream(state: StreamState): Generator<StreamEvent> {
  // Close content if it was opened.
  if (state.contentStarted) {
    yield { type: 'content.end', index: 0 };
  }

  // Add text to content parts.
  if (state.fullText) {
    state.content.unshift({ kind: 'text', text: state.fullText });
  }

  // Determine finish reason: if tool calls present, it's tool_calls.
  const finishReason: FinishReason =
    state.toolCalls.length > 0 ? 'tool_calls' : state.finishReason;

  // Build the final assembled response.
  const response: Response = {
    id: `gemini_${Date.now()}`,
    model: state.model,
    text: state.fullText,
    content: state.content,
    toolCalls: state.toolCalls,
    finishReason,
    usage: state.usage,
    providerMetadata: { provider: 'gemini' },
  };

  yield {
    type: 'stream.end',
    response,
    usage: state.usage,
    finishReason,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
      return 'content_filter';
    case 'RECITATION':
      return 'content_filter';
    default:
      return 'stop';
  }
}
