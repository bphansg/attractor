/**
 * @attractor/agent — Tool Output Truncation
 *
 * Keeps tool output within configured character and line budgets so that the
 * model's context window is not overwhelmed by verbose results.
 *
 * Character-based truncation runs first, then line-based truncation.
 */

import type { SessionConfig } from './session-config.js';

// ---------------------------------------------------------------------------
// Truncation modes
// ---------------------------------------------------------------------------

export type TruncationMode = 'head_tail' | 'tail';

// ---------------------------------------------------------------------------
// Truncation marker
// ---------------------------------------------------------------------------

const CHAR_MARKER =
  '\n\n--- OUTPUT TRUNCATED ({removed} characters removed) ---\n\n';
const LINE_MARKER =
  '\n\n--- OUTPUT TRUNCATED ({removed} lines removed) ---\n\n';

// ---------------------------------------------------------------------------
// Character-based truncation
// ---------------------------------------------------------------------------

/**
 * Truncate `output` to at most `maxChars` characters.
 *
 * - `head_tail` keeps equal portions from the beginning and end, inserting a
 *   truncation marker in the middle.
 * - `tail` keeps only the last `maxChars` characters, prepending a marker.
 */
export function truncateOutput(
  output: string,
  maxChars: number,
  mode: TruncationMode,
): string {
  if (output.length <= maxChars) {
    return output;
  }

  const removed = output.length - maxChars;
  const marker = CHAR_MARKER.replace('{removed}', String(removed));

  if (mode === 'tail') {
    return marker + output.slice(output.length - maxChars);
  }

  // head_tail: split budget equally between head and tail, minus marker
  const budget = maxChars - marker.length;
  if (budget <= 0) {
    return marker;
  }

  const headSize = Math.ceil(budget / 2);
  const tailSize = budget - headSize;

  const head = output.slice(0, headSize);
  const tail = tailSize > 0 ? output.slice(output.length - tailSize) : '';

  return head + marker + tail;
}

// ---------------------------------------------------------------------------
// Line-based truncation
// ---------------------------------------------------------------------------

/**
 * Truncate `output` to at most `maxLines` lines, keeping the first and last
 * portions and inserting a truncation marker.
 */
export function truncateLines(output: string, maxLines: number): string {
  const lines = output.split('\n');

  if (lines.length <= maxLines) {
    return output;
  }

  const removed = lines.length - maxLines;
  const marker = LINE_MARKER.replace('{removed}', String(removed));

  const headCount = Math.ceil(maxLines / 2);
  const tailCount = maxLines - headCount;

  const head = lines.slice(0, headCount);
  const tail = tailCount > 0 ? lines.slice(lines.length - tailCount) : [];

  return head.join('\n') + marker + tail.join('\n');
}

// ---------------------------------------------------------------------------
// Combined truncation for tool output
// ---------------------------------------------------------------------------

/**
 * Apply both character and line truncation to a tool's output, respecting the
 * per-tool limits in the session config.
 *
 * Character-based truncation runs first, then line-based truncation.
 */
export function truncateToolOutput(
  output: string,
  toolName: string,
  config: SessionConfig,
): string {
  let result = output;

  // 1. Character-based truncation
  const charLimit = config.toolOutputLimits[toolName];
  if (charLimit !== undefined && result.length > charLimit) {
    result = truncateOutput(result, charLimit, 'head_tail');
  }

  // 2. Line-based truncation
  const lineLimit = config.toolLineLimits[toolName];
  if (lineLimit !== undefined) {
    result = truncateLines(result, lineLimit);
  }

  return result;
}
