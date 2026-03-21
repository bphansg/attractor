// @attractor/llm — Anthropic Stream Translation
// Translates Anthropic SSE stream events -> unified StreamEvent.

import type { StreamEvent } from '../../types/stream.js';
import type { FinishReason, Usage, Response } from '../../types/response.js';
import type { ContentPart, ThinkingContent, RedactedThinkingContent } from '../../types/message.js';
import type { ToolCall } from '../../types/tool.js';
import type { SSEEvent } from '../../utils/sse.js';

// ── Anthropic streaming event types ─────────────────────────────────────────

interface AnthropicMessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: [];
    stop_reason: null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

interface AnthropicContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block:
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'thinking'; thinking: string; signature?: string }
    | { type: 'redacted_thinking'; data: string };
}

interface AnthropicContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'input_json_delta'; partial_json: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'signature_delta'; signature: string };
}

interface AnthropicContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

interface AnthropicMessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: string | null;
    stop_sequence?: string | null;
  };
  usage?: {
    output_tokens: number;
  };
}

interface AnthropicMessageStopEvent {
  type: 'message_stop';
}

interface AnthropicPingEvent {
  type: 'ping';
}

interface AnthropicErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

type AnthropicStreamEvent =
  | AnthropicMessageStartEvent
  | AnthropicContentBlockStartEvent
  | AnthropicContentBlockDeltaEvent
  | AnthropicContentBlockStopEvent
  | AnthropicMessageDeltaEvent
  | AnthropicMessageStopEvent
  | AnthropicPingEvent
  | AnthropicErrorEvent;

// ── Stream Accumulator ──────────────────────────────────────────────────────

/** Tracks state accumulated across streaming events to build the final Response. */
interface StreamAccumulator {
  id: string;
  model: string;
  finishReason: FinishReason;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Map from content block index to its accumulated state. */
  blocks: Map<number, BlockState>;
}

type BlockState =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; jsonBuf: string }
  | { type: 'thinking'; text: string; signature: string }
  | { type: 'redacted_thinking'; data: string };

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Translate an async iterable of SSE events from the Anthropic API
 * into unified StreamEvent objects.
 */
export async function* translateStream(
  sseEvents: AsyncIterable<SSEEvent>,
): AsyncGenerator<StreamEvent> {
  const acc: StreamAccumulator = {
    id: '',
    model: '',
    finishReason: 'stop',
    inputTokens: 0,
    outputTokens: 0,
    blocks: new Map(),
  };

  for await (const sse of sseEvents) {
    // Anthropic sends `event: <type>` and `data: <json>`.
    // Some events (like ping) may have no meaningful data.
    if (sse.event === 'ping' || !sse.data) continue;

    let parsed: AnthropicStreamEvent;
    try {
      parsed = JSON.parse(sse.data) as AnthropicStreamEvent;
    } catch {
      continue; // Skip malformed data lines.
    }

    const events = translateAnthropicEvent(parsed, acc);
    for (const event of events) {
      yield event;
    }
  }
}

// ── Event translation ───────────────────────────────────────────────────────

function translateAnthropicEvent(
  event: AnthropicStreamEvent,
  acc: StreamAccumulator,
): StreamEvent[] {
  switch (event.type) {
    case 'message_start':
      return handleMessageStart(event, acc);
    case 'content_block_start':
      return handleContentBlockStart(event, acc);
    case 'content_block_delta':
      return handleContentBlockDelta(event, acc);
    case 'content_block_stop':
      return handleContentBlockStop(event, acc);
    case 'message_delta':
      return handleMessageDelta(event, acc);
    case 'message_stop':
      return handleMessageStop(acc);
    case 'error':
      // Surface the error as a stream.end with error finishReason.
      acc.finishReason = 'error';
      return [];
    case 'ping':
      return [];
    default:
      return [];
  }
}

function handleMessageStart(
  event: AnthropicMessageStartEvent,
  acc: StreamAccumulator,
): StreamEvent[] {
  acc.id = event.message.id;
  acc.model = event.message.model;
  acc.inputTokens = event.message.usage.input_tokens;
  acc.outputTokens = event.message.usage.output_tokens;
  if (event.message.usage.cache_read_input_tokens != null) {
    acc.cacheReadTokens = event.message.usage.cache_read_input_tokens;
  }
  if (event.message.usage.cache_creation_input_tokens != null) {
    acc.cacheWriteTokens = event.message.usage.cache_creation_input_tokens;
  }

  return [{ type: 'stream.start' }];
}

function handleContentBlockStart(
  event: AnthropicContentBlockStartEvent,
  acc: StreamAccumulator,
): StreamEvent[] {
  const block = event.content_block;
  const index = event.index;

  switch (block.type) {
    case 'text':
      acc.blocks.set(index, { type: 'text', text: block.text });
      return [{ type: 'content.start', index }];

    case 'tool_use':
      acc.blocks.set(index, {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        jsonBuf: '',
      });
      return [{
        type: 'tool_call.start',
        index,
        toolCall: { id: block.id, name: block.name },
      }];

    case 'thinking':
      acc.blocks.set(index, { type: 'thinking', text: block.thinking, signature: block.signature ?? '' });
      return [{ type: 'thinking.start', index }];

    case 'redacted_thinking':
      acc.blocks.set(index, { type: 'redacted_thinking', data: block.data });
      // No specific stream event for redacted thinking start; skip.
      return [];

    default:
      return [];
  }
}

function handleContentBlockDelta(
  event: AnthropicContentBlockDeltaEvent,
  acc: StreamAccumulator,
): StreamEvent[] {
  const delta = event.delta;
  const index = event.index;
  const block = acc.blocks.get(index);

  switch (delta.type) {
    case 'text_delta':
      if (block && block.type === 'text') {
        block.text += delta.text;
      }
      return [{ type: 'content.delta', index, text: delta.text }];

    case 'input_json_delta':
      if (block && block.type === 'tool_use') {
        block.jsonBuf += delta.partial_json;
      }
      return [{ type: 'tool_call.delta', index, toolCall: { arguments: delta.partial_json as unknown as Record<string, unknown> } }];

    case 'thinking_delta':
      if (block && block.type === 'thinking') {
        block.text += delta.thinking;
      }
      return [{ type: 'thinking.delta', index, text: delta.thinking }];

    case 'signature_delta':
      if (block && block.type === 'thinking') {
        block.signature += delta.signature;
      }
      // No unified event for signature delta; signature is captured at end.
      return [];

    default:
      return [];
  }
}

function handleContentBlockStop(
  event: AnthropicContentBlockStopEvent,
  acc: StreamAccumulator,
): StreamEvent[] {
  const index = event.index;
  const block = acc.blocks.get(index);

  if (!block) return [];

  switch (block.type) {
    case 'text':
      return [{ type: 'content.end', index }];

    case 'tool_use': {
      let args: Record<string, unknown> = {};
      if (block.jsonBuf) {
        try {
          args = JSON.parse(block.jsonBuf) as Record<string, unknown>;
        } catch {
          // If JSON parsing fails, pass empty args.
        }
      }
      return [{
        type: 'tool_call.end',
        index,
        toolCall: { id: block.id, name: block.name, arguments: args },
      }];
    }

    case 'thinking':
      return [{ type: 'thinking.end', index }];

    case 'redacted_thinking':
      return [];

    default:
      return [];
  }
}

function handleMessageDelta(
  event: AnthropicMessageDeltaEvent,
  acc: StreamAccumulator,
): StreamEvent[] {
  if (event.delta.stop_reason) {
    acc.finishReason = translateStopReason(event.delta.stop_reason);
  }
  if (event.usage) {
    acc.outputTokens = event.usage.output_tokens;
  }
  return [];
}

function handleMessageStop(acc: StreamAccumulator): StreamEvent[] {
  const response = buildFinalResponse(acc);
  const usage = response.usage;

  return [{
    type: 'stream.end',
    response,
    usage,
    finishReason: acc.finishReason,
  }];
}

// ── Response assembly ───────────────────────────────────────────────────────

function buildFinalResponse(acc: StreamAccumulator): Response {
  const content: ContentPart[] = [];
  const toolCalls: ToolCall[] = [];
  const textParts: string[] = [];
  const thinkingParts: string[] = [];

  // Process blocks in index order.
  const sortedEntries = [...acc.blocks.entries()].sort((a, b) => a[0] - b[0]);

  for (const [, block] of sortedEntries) {
    switch (block.type) {
      case 'text':
        content.push({ kind: 'text', text: block.text });
        textParts.push(block.text);
        break;

      case 'tool_use': {
        let args: Record<string, unknown> = {};
        if (block.jsonBuf) {
          try {
            args = JSON.parse(block.jsonBuf) as Record<string, unknown>;
          } catch {
            // pass
          }
        }
        const tc: ToolCall = { id: block.id, name: block.name, arguments: args };
        content.push({ kind: 'tool_call', toolCall: tc });
        toolCalls.push(tc);
        break;
      }

      case 'thinking':
        content.push({
          kind: 'thinking',
          text: block.text,
          ...(block.signature && { signature: block.signature }),
        } satisfies ThinkingContent);
        thinkingParts.push(block.text);
        break;

      case 'redacted_thinking':
        content.push({
          kind: 'redacted_thinking',
          data: block.data,
        } satisfies RedactedThinkingContent);
        break;
    }
  }

  const usage: Usage = {
    promptTokens: acc.inputTokens,
    completionTokens: acc.outputTokens,
    totalTokens: acc.inputTokens + acc.outputTokens,
    ...(acc.cacheReadTokens != null && { cacheReadTokens: acc.cacheReadTokens }),
    ...(acc.cacheWriteTokens != null && { cacheWriteTokens: acc.cacheWriteTokens }),
  };

  return {
    id: acc.id,
    model: acc.model,
    text: textParts.join(''),
    content,
    toolCalls,
    finishReason: acc.finishReason,
    usage,
    ...(thinkingParts.length > 0 && { reasoning: thinkingParts.join('\n') }),
  };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function translateStopReason(reason: string): FinishReason {
  switch (reason) {
    case 'end_turn':
      return 'stop';
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    case 'stop_sequence':
      return 'stop';
    default:
      return 'stop';
  }
}
