/**
 * @attractor/llm — Stream Types
 *
 * Defines the event types emitted during streaming responses.
 */

import type { ToolCall } from './tool.js';
import type { Response } from './response.js';
import type { Usage, FinishReason } from './response.js';

/** Discriminant values for streaming events. */
export type StreamEventType =
  | 'stream.start'
  | 'content.start'
  | 'content.delta'
  | 'content.end'
  | 'tool_call.start'
  | 'tool_call.delta'
  | 'tool_call.end'
  | 'thinking.start'
  | 'thinking.delta'
  | 'thinking.end'
  | 'stream.end';

/** A single event emitted during a streaming response. */
export interface StreamEvent {
  /** The event type. */
  type: StreamEventType;
  /** The index of the content part or tool call this event relates to. */
  index?: number;
  /** Text delta for content and thinking events. */
  text?: string;
  /** Partial tool call data for tool call events. */
  toolCall?: Partial<ToolCall>;
  /** The final assembled response (present on 'stream.end'). */
  response?: Response;
  /** Token usage statistics (present on 'stream.end'). */
  usage?: Usage;
  /** The reason generation stopped (present on 'stream.end'). */
  finishReason?: FinishReason;
}
