// @attractor/llm — Stream Accumulator
// Accumulates StreamEvent objects into a complete Response.

import type { StreamEvent, Response, ToolCall, Usage, ContentPart, TextContent, ThinkingContent } from '../types/index.js';

// ── StreamAccumulator ────────────────────────────────────────────────────────

/**
 * Collects streaming events and builds a complete Response.
 *
 * Usage:
 * ```ts
 * const acc = new StreamAccumulator();
 * for await (const event of stream) {
 *   acc.push(event);
 * }
 * const response = acc.getResponse();
 * ```
 */
export class StreamAccumulator {
  private textParts: string[] = [];
  private thinkingParts: string[] = [];

  // Tool calls in flight, keyed by index.
  private toolCallsInProgress: Map<number, { id: string; name: string; argumentChunks: string[] }> =
    new Map();
  // Completed tool calls in order.
  private completedToolCalls: ToolCall[] = [];

  private usage: Usage | undefined;
  private finishReason: Response['finishReason'] | undefined;
  private responseId = '';
  private model = '';

  /**
   * Push a stream event into the accumulator.
   */
  push(event: StreamEvent): void {
    switch (event.type) {
      case 'content.delta':
        if (event.text) {
          this.textParts.push(event.text);
        }
        break;

      case 'tool_call.start':
        if (event.toolCall && event.index != null) {
          this.toolCallsInProgress.set(event.index, {
            id: event.toolCall.id ?? '',
            name: event.toolCall.name ?? '',
            argumentChunks: [],
          });
        }
        break;

      case 'tool_call.delta': {
        if (event.index != null) {
          const inProgress = this.toolCallsInProgress.get(event.index);
          if (inProgress && event.text) {
            inProgress.argumentChunks.push(event.text);
          }
        }
        break;
      }

      case 'tool_call.end': {
        if (event.index != null) {
          const completed = this.toolCallsInProgress.get(event.index);
          if (completed) {
            let parsedArgs: Record<string, unknown> = {};
            const raw = completed.argumentChunks.join('');
            try {
              parsedArgs = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              // If parsing fails, store the raw string under a fallback key.
              parsedArgs = { _raw: raw };
            }
            this.completedToolCalls.push({
              id: completed.id,
              name: completed.name,
              arguments: parsedArgs,
            });
            this.toolCallsInProgress.delete(event.index);
          }
        }
        break;
      }

      case 'thinking.delta':
        if (event.text) {
          this.thinkingParts.push(event.text);
        }
        break;

      case 'stream.end':
        if (event.usage) {
          this.usage = event.usage;
        }
        if (event.finishReason) {
          this.finishReason = event.finishReason;
        }
        break;

      default:
        // stream.start, content.start, content.end, thinking.start,
        // thinking.end are informational — nothing to accumulate.
        break;
    }
  }

  /**
   * Build the accumulated Response.
   * Can be called at any time to get a snapshot; typically called after
   * the stream has ended.
   */
  getResponse(): Response {
    const content: ContentPart[] = [];
    const text = this.getText();
    if (text) {
      content.push({ kind: 'text', text } satisfies TextContent);
    }
    const reasoning = this.getThinkingText();
    if (reasoning) {
      content.push({ kind: 'thinking', text: reasoning } satisfies ThinkingContent);
    }

    return {
      id: this.responseId,
      model: this.model,
      text,
      content,
      toolCalls: this.getToolCalls(),
      usage: this.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: this.finishReason ?? 'stop',
      reasoning,
    };
  }

  /**
   * Get the accumulated text content.
   */
  getText(): string {
    return this.textParts.join('');
  }

  /**
   * Get the accumulated thinking/reasoning text.
   * Returns undefined if no thinking events were received.
   */
  getThinkingText(): string | undefined {
    if (this.thinkingParts.length === 0) return undefined;
    return this.thinkingParts.join('');
  }

  /**
   * Get all completed tool calls.
   * Tool calls that are still in progress (received start/delta but no end)
   * are not included.
   */
  getToolCalls(): ToolCall[] {
    return [...this.completedToolCalls];
  }

  /**
   * Set response metadata (ID, model) from stream start events.
   * Provider adapters call this when they receive the initial stream metadata.
   */
  setMetadata(metadata: { id?: string; model?: string }): void {
    if (metadata.id) this.responseId = metadata.id;
    if (metadata.model) this.model = metadata.model;
  }

  /**
   * Push a thinking/reasoning delta.
   * This is separate from the standard StreamEvent types because provider
   * adapters may want to push thinking deltas directly.
   */
  pushThinkingDelta(delta: string): void {
    this.thinkingParts.push(delta);
  }

  /**
   * Returns true if any content (text or tool calls) has been accumulated.
   */
  hasContent(): boolean {
    return this.textParts.length > 0 || this.completedToolCalls.length > 0 || this.toolCallsInProgress.size > 0;
  }
}
