import { describe, it, expect } from 'vitest';
import { truncateOutput, truncateLines } from '../truncation.js';

// ---------------------------------------------------------------------------
// truncateOutput (character-based)
// ---------------------------------------------------------------------------

describe('truncateOutput', () => {
  it('returns unchanged output when under the character limit', () => {
    const output = 'short text';
    const result = truncateOutput(output, 1000, 'head_tail');

    expect(result).toBe(output);
  });

  it('head_tail mode splits output with a truncation marker in the middle', () => {
    const output = 'A'.repeat(200);
    const result = truncateOutput(output, 100, 'head_tail');

    expect(result.length).toBeLessThanOrEqual(200);
    expect(result).toContain('OUTPUT TRUNCATED');
    expect(result).toContain('characters removed');
    // The result should start with some A's (head) and end with some A's (tail)
    expect(result.startsWith('A')).toBe(true);
    expect(result.endsWith('A')).toBe(true);
  });

  it('tail mode keeps the end of the output', () => {
    const head = 'H'.repeat(100);
    const tail = 'T'.repeat(100);
    const output = head + tail;
    const result = truncateOutput(output, 100, 'tail');

    expect(result).toContain('OUTPUT TRUNCATED');
    // The last 100 chars of the original are all T's, so the result should end with T's
    expect(result.endsWith('T'.repeat(100))).toBe(true);
    // Should not contain any H's (the head was cut off)
    expect(result).not.toContain('H');
  });
});

// ---------------------------------------------------------------------------
// truncateLines (line-based)
// ---------------------------------------------------------------------------

describe('truncateLines', () => {
  it('returns unchanged output when under the line limit', () => {
    const output = 'line1\nline2\nline3';
    const result = truncateLines(output, 10);

    expect(result).toBe(output);
  });

  it('truncates to max lines with a marker', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    const output = lines.join('\n');
    const result = truncateLines(output, 6);

    expect(result).toContain('OUTPUT TRUNCATED');
    expect(result).toContain('lines removed');
    // Should contain some of the first lines and some of the last lines
    expect(result).toContain('line-0');
    expect(result).toContain('line-19');
  });
});
