/**
 * @attractor/agent — Session Event System
 *
 * Provides a lightweight pub/sub mechanism for observing session lifecycle
 * events, streaming deltas, tool execution, and diagnostic signals.
 */

// ---------------------------------------------------------------------------
// Event kinds
// ---------------------------------------------------------------------------

export type EventKind =
  | 'session.start'
  | 'session.end'
  | 'user.input'
  | 'processing.end'
  | 'assistant.text.start'
  | 'assistant.text.delta'
  | 'assistant.text.end'
  | 'tool_call.start'
  | 'tool_call.output.delta'
  | 'tool_call.end'
  | 'steering.injected'
  | 'turn.limit'
  | 'loop.detection'
  | 'warning'
  | 'error';

// ---------------------------------------------------------------------------
// Event payload
// ---------------------------------------------------------------------------

export interface SessionEvent {
  kind: EventKind;
  timestamp: Date;
  sessionId: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

export type EventHandler = (event: SessionEvent) => void;

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

export class EventEmitter {
  private handlers: EventHandler[] = [];

  /**
   * Register an event handler.
   *
   * @returns An unsubscribe function that removes the handler when called.
   */
  on(handler: EventHandler): () => void {
    this.handlers.push(handler);

    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx !== -1) {
        this.handlers.splice(idx, 1);
      }
    };
  }

  /**
   * Emit an event to all registered handlers.
   */
  emit(
    kind: EventKind,
    sessionId: string,
    data: Record<string, unknown> = {},
  ): void {
    const event: SessionEvent = {
      kind,
      timestamp: new Date(),
      sessionId,
      data,
    };

    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Swallow handler errors to avoid crashing the session loop.
      }
    }
  }
}
