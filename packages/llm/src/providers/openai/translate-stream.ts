// @attractor/llm — OpenAI Responses API Stream Translation
// Translates OpenAI SSE stream events into unified StreamEvent objects.

import type { StreamEvent, Usage, FinishReason, ToolCall } from '../../types/index.js';
import { parseSSEStream } from '../../utils/sse.js';
import { StreamAccumulator } from '../../utils/stream-accumulator.js';

// ── OpenAI SSE Event Data Types ──────────────────────────────────────────────

interface OpenAIStreamResponseCreated {
  id: string;
  model: string;
  [key: string]: unknown;
}

interface OpenAIStreamOutputItemAdded {
  output_index: number;
  item: {
    type: string;
    id?: string;
    name?: string;
    call_id?: string;
    [key: string]: unknown;
  };
}

interface OpenAIStreamOutputTextDelta {
  output_index: number;
  content_index: number;
  delta: string;
}

interface OpenAIStreamFunctionCallArgsDelta {
  output_index: number;
  delta: string;
  [key: string]: unknown;
}

interface OpenAIStreamFunctionCallArgsDone {
  output_index: number;
  arguments: string;
  call_id?: string;
  name?: string;
  [key: string]: unknown;
}

interface OpenAIStreamOutputItemDone {
  output_index: number;
  item: {
    type: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  };
}

interface OpenAIStreamCompleted {
  id: string;
  model: string;
  status?: string;
  output?: Array<{ type: string; [key: string]: unknown }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
    input_tokens_details?: { cached_tokens?: number };
  };
  [key: string]: unknown;
}

// ── Stream Translation ───────────────────────────────────────────────────────

/**
 * Translate an OpenAI SSE byte stream into unified StreamEvents.
 *
 * This generator parses the raw SSE stream, maps OpenAI event types to unified
 * StreamEvents, and uses a StreamAccumulator to build the final Response
 * emitted with the stream.end event.
 */
export async function* translateStream(
  byteStream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const accumulator = new StreamAccumulator();

  // Track tool call indices: OpenAI output_index → our sequential tool call index.
  const toolCallIndexMap = new Map<number, number>();
  let nextToolCallIndex = 0;

  // Track tool call metadata by output index.
  const toolCallMeta = new Map<number, { id: string; name: string }>();

  for await (const sse of parseSSEStream(byteStream)) {
    // Skip empty data or [DONE] sentinel.
    if (!sse.data || sse.data === '[DONE]') {
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sse.data) as Record<string, unknown>;
    } catch {
      continue;
    }

    const eventType = sse.event ?? '';

    switch (eventType) {
      // ── Response created ─────────────────────────────────────────────
      case 'response.created': {
        const data = parsed as unknown as OpenAIStreamResponseCreated;
        accumulator.setMetadata({ id: data.id, model: data.model });
        yield { type: 'stream.start' };
        break;
      }

      // ── Output item added (message or function_call) ────────────────
      case 'response.output_item.added': {
        const data = parsed as unknown as OpenAIStreamOutputItemAdded;
        if (data.item.type === 'function_call') {
          const idx = nextToolCallIndex++;
          toolCallIndexMap.set(data.output_index, idx);
          const id = data.item.call_id ?? data.item.id ?? '';
          const name = data.item.name ?? '';
          toolCallMeta.set(data.output_index, { id, name });
          yield {
            type: 'tool_call.start',
            index: idx,
            toolCall: { id, name, arguments: {} } satisfies ToolCall,
          };
        } else if (data.item.type === 'message') {
          yield { type: 'content.start', index: data.output_index };
        }
        break;
      }

      // ── Text content delta ──────────────────────────────────────────
      case 'response.output_text.delta': {
        const data = parsed as unknown as OpenAIStreamOutputTextDelta;
        yield { type: 'content.delta', text: data.delta };
        break;
      }

      // ── Text content done ───────────────────────────────────────────
      case 'response.output_text.done': {
        yield { type: 'content.end' };
        break;
      }

      // ── Function call arguments delta ───────────────────────────────
      case 'response.function_call_arguments.delta': {
        const data = parsed as unknown as OpenAIStreamFunctionCallArgsDelta;
        const idx = toolCallIndexMap.get(data.output_index);
        if (idx !== undefined) {
          yield {
            type: 'tool_call.delta',
            index: idx,
            text: data.delta,
          };
        }
        break;
      }

      // ── Function call arguments done ────────────────────────────────
      case 'response.function_call_arguments.done': {
        const data = parsed as unknown as OpenAIStreamFunctionCallArgsDone;
        const idx = toolCallIndexMap.get(data.output_index);
        if (idx !== undefined) {
          yield {
            type: 'tool_call.end',
            index: idx,
          };
        }
        break;
      }

      // ── Output item done ────────────────────────────────────────────
      case 'response.output_item.done': {
        // This fires after the content or function call is fully streamed.
        // We already handle end events via text.done / arguments.done, so
        // this is mostly informational. No additional event needed.
        break;
      }

      // ── Response completed ──────────────────────────────────────────
      case 'response.completed': {
        const data = parsed as unknown as OpenAIStreamCompleted;
        accumulator.setMetadata({ id: data.id, model: data.model });

        const hasToolCalls = toolCallIndexMap.size > 0;
        const finishReason = mapStreamFinishReason(data.status, hasToolCalls);

        const usage = mapStreamUsage(data.usage);

        yield {
          type: 'stream.end',
          finishReason,
          usage,
          response: {
            id: data.id,
            model: data.model,
            text: '', // Caller uses StreamAccumulator to assemble text.
            content: [],
            toolCalls: [],
            finishReason,
            usage,
          },
        };
        break;
      }

      // ── Error event ─────────────────────────────────────────────────
      case 'error': {
        // OpenAI may emit error events in the stream.
        // We surface them as stream.end with error finish reason.
        const errorMsg = (parsed['message'] as string) ?? 'Stream error';
        yield {
          type: 'stream.end',
          finishReason: 'error',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
        break;
      }

      default:
        // Unknown event types are silently ignored — forward compatibility.
        break;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStreamFinishReason(status: string | undefined, hasToolCalls: boolean): FinishReason {
  switch (status) {
    case 'completed':
      return hasToolCalls ? 'tool_calls' : 'stop';
    case 'incomplete':
      return 'length';
    case 'failed':
    case 'cancelled':
      return 'error';
    default:
      return hasToolCalls ? 'tool_calls' : 'stop';
  }
}

function mapStreamUsage(usage: OpenAIStreamCompleted['usage']): Usage {
  const reasoningTokens =
    usage.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens;
  const cacheReadTokens = usage.input_tokens_details?.cached_tokens;

  return {
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
    ...(reasoningTokens !== undefined && { reasoningTokens }),
    ...(cacheReadTokens !== undefined && { cacheReadTokens }),
  };
}
