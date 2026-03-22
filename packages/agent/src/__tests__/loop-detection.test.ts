import { describe, it, expect } from 'vitest';
import { detectLoop } from '../loop-detection.js';
import type { AssistantTurn, Turn } from '../session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssistantTurn(toolName: string, args: Record<string, unknown> = {}): AssistantTurn {
  return {
    type: 'assistant',
    content: '',
    toolCalls: [{ id: '1', name: toolName, arguments: args }],
    reasoning: null,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    responseId: null,
    timestamp: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectLoop', () => {
  it('returns false for empty history', () => {
    expect(detectLoop([], 10)).toBe(false);
  });

  it('returns false for non-repeating turns', () => {
    const history: Turn[] = [
      makeAssistantTurn('read_file', { path: '/a.ts' }),
      makeAssistantTurn('write_file', { path: '/b.ts' }),
      makeAssistantTurn('grep', { pattern: 'foo' }),
    ];

    expect(detectLoop(history, 10)).toBe(false);
  });

  it('detects a length-1 repeating pattern (same tool call repeated)', () => {
    const turn = makeAssistantTurn('read_file', { path: '/same.ts' });
    const history: Turn[] = [turn, turn];

    expect(detectLoop(history, 10)).toBe(true);
  });

  it('detects a length-2 repeating pattern', () => {
    const turnA = makeAssistantTurn('read_file', { path: '/a.ts' });
    const turnB = makeAssistantTurn('write_file', { path: '/b.ts' });
    // Pattern: A, B, A, B
    const history: Turn[] = [turnA, turnB, turnA, turnB];

    expect(detectLoop(history, 10)).toBe(true);
  });
});
