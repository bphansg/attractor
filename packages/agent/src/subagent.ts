/**
 * @attractor/agent — Subagent Types
 *
 * Defines the handle and result types used when the agent spawns a child
 * session (subagent) to perform a scoped sub-task.
 */

import type { Session } from './session.js';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type SubAgentStatus = 'running' | 'completed' | 'failed';

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

/**
 * A handle to a running or completed subagent session.
 */
export interface SubAgentHandle {
  /** Unique identifier for this subagent invocation. */
  id: string;
  /** The child session executing the sub-task. */
  session: Session;
  /** Current status of the subagent. */
  status: SubAgentStatus;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * The outcome of a completed subagent run, returned to the parent session as
 * tool output.
 */
export interface SubAgentResult {
  /** The textual output produced by the subagent. */
  output: string;
  /** Whether the subagent completed successfully (vs. errored or was aborted). */
  success: boolean;
  /** Number of turns the subagent consumed. */
  turnsUsed: number;
}
