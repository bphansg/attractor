// @attractor/llm — SSE Stream Parser
// Parses a ReadableStream of bytes into Server-Sent Events per the SSE spec.

// ── Types ────────────────────────────────────────────────────────────────────

export interface SSEEvent {
  /** The `event:` field value, if present. */
  event?: string;
  /** The `data:` field value (multi-line data is concatenated with newlines). */
  data: string;
  /** The `id:` field value, if present. */
  id?: string;
  /** The `retry:` field value in milliseconds, if present. */
  retry?: number;
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a ReadableStream of bytes as an SSE stream, yielding parsed events.
 *
 * Follows the SSE specification:
 * - Lines starting with `:` are comments (ignored).
 * - Empty lines dispatch the accumulated event.
 * - `data:`, `event:`, `id:`, `retry:` fields are recognized.
 * - Multi-line `data:` fields are concatenated with `\n`.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let currentEvent: Partial<SSEEvent> & { dataLines: string[] } = { dataLines: [] };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines. SSE lines are delimited by \r\n, \r, or \n.
      const lines = buffer.split(/\r\n|\r|\n/);
      // The last element may be an incomplete line — keep it in the buffer.
      buffer = lines.pop()!;

      for (const line of lines) {
        const event = processLine(line, currentEvent);
        if (event) {
          yield event;
          currentEvent = { dataLines: [] };
        }
      }
    }

    // Flush any remaining buffer content.
    if (buffer.length > 0) {
      const event = processLine(buffer, currentEvent);
      if (event) {
        yield event;
        currentEvent = { dataLines: [] };
      }
    }

    // If there's an accumulated event with data at end of stream, dispatch it.
    if (currentEvent.dataLines.length > 0 || currentEvent.event || currentEvent.id) {
      const dispatched = dispatchEvent(currentEvent);
      if (dispatched) {
        yield dispatched;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Process a single SSE line. Returns a dispatched event if the line is empty
 * (event boundary), or undefined otherwise.
 */
function processLine(
  line: string,
  current: Partial<SSEEvent> & { dataLines: string[] },
): SSEEvent | undefined {
  // Empty line = dispatch the accumulated event.
  if (line === '') {
    return dispatchEvent(current);
  }

  // Comment lines start with `:`.
  if (line.startsWith(':')) {
    return undefined;
  }

  // Parse field:value. The spec says: if the line contains a `:`, the field
  // is everything before the first `:`, and the value is everything after
  // (with a single leading space stripped if present).
  let field: string;
  let value: string;

  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) {
    // No colon — the entire line is the field name, value is empty string.
    field = line;
    value = '';
  } else {
    field = line.slice(0, colonIndex);
    value = line.slice(colonIndex + 1);
    // Strip a single leading space from the value.
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
  }

  switch (field) {
    case 'data':
      current.dataLines.push(value);
      break;
    case 'event':
      current.event = value;
      break;
    case 'id':
      current.id = value;
      break;
    case 'retry': {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        current.retry = parsed;
      }
      break;
    }
    // Unknown fields are ignored per spec.
  }

  return undefined;
}

/**
 * Dispatch the accumulated event fields. Returns the event if there is data
 * to dispatch, or undefined if the accumulator is empty.
 */
function dispatchEvent(
  current: Partial<SSEEvent> & { dataLines: string[] },
): SSEEvent | undefined {
  // Per spec, if no data was set, the event is not dispatched (unless there
  // was an explicit event type set — but most implementations require data).
  if (current.dataLines.length === 0 && !current.event && !current.id) {
    return undefined;
  }

  return {
    data: current.dataLines.join('\n'),
    ...(current.event !== undefined && { event: current.event }),
    ...(current.id !== undefined && { id: current.id }),
    ...(current.retry !== undefined && { retry: current.retry }),
  };
}
