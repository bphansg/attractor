/**
 * @attractor/agent — Loop Detection
 *
 * Inspects recent tool-call history for repeating patterns that indicate the
 * agent is stuck.  Checks for cycles of length 1, 2, or 3 within a sliding
 * window of recent turns.
 */

import type { Turn, AssistantTurn } from './session.js';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Signature extraction
// ---------------------------------------------------------------------------

/**
 * Produce a compact, deterministic signature for a tool call by hashing its
 * name and stringified arguments.
 */
function toolCallSignature(name: string, args: Record<string, unknown>): string {
  const payload = name + ':' + JSON.stringify(args);
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Extract an ordered list of tool-call signatures from recent assistant turns
 * within a sliding window.
 */
function extractSignatures(history: Turn[], windowSize: number): string[] {
  const signatures: string[] = [];

  // Walk backwards through history, collecting from assistant turns that have
  // tool calls, until we have enough entries.
  const recent = history.slice(-windowSize * 3); // generous slice

  for (const turn of recent) {
    if (turn.type === 'assistant') {
      const assistantTurn = turn as AssistantTurn;
      for (const tc of assistantTurn.toolCalls) {
        signatures.push(toolCallSignature(tc.name, tc.arguments));
      }
    }
  }

  // Only look at the tail within the window
  return signatures.slice(-windowSize);
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Check whether the array `sigs` ends with a repeating pattern of the given
 * `patternLength`.  A pattern must repeat at least twice to be considered a
 * loop.
 */
function hasRepeatingPattern(sigs: string[], patternLength: number): boolean {
  const needed = patternLength * 2;
  if (sigs.length < needed) {
    return false;
  }

  const tail = sigs.slice(-needed);
  const first = tail.slice(0, patternLength);
  const second = tail.slice(patternLength);

  for (let i = 0; i < patternLength; i++) {
    if (first[i] !== second[i]) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether the agent is stuck in a loop by examining recent tool-call
 * signatures for repeating patterns of length 1, 2, or 3.
 *
 * @param history    The full session turn history.
 * @param windowSize Number of recent signatures to inspect.
 * @returns `true` if a repeating pattern is detected.
 */
export function detectLoop(history: Turn[], windowSize: number): boolean {
  const sigs = extractSignatures(history, windowSize);

  if (sigs.length < 2) {
    return false;
  }

  // Check for repeating patterns of length 1, 2, and 3
  for (const patternLen of [1, 2, 3]) {
    if (hasRepeatingPattern(sigs, patternLen)) {
      return true;
    }
  }

  return false;
}
