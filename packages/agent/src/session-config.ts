/**
 * @attractor/agent — Session Configuration
 *
 * Central configuration for session behaviour: turn limits, tool output
 * truncation thresholds, loop detection settings, and subagent depth.
 */

// ---------------------------------------------------------------------------
// SessionConfig
// ---------------------------------------------------------------------------

export interface SessionConfig {
  /** Maximum number of user turns before the session auto-closes. 0 = unlimited. */
  maxTurns: number;
  /** Maximum tool-call rounds per single user input. 0 = unlimited. */
  maxToolRoundsPerInput: number;
  /** Default timeout (ms) for command execution. */
  defaultCommandTimeoutMs: number;
  /** Hard ceiling (ms) for any single command execution. */
  maxCommandTimeoutMs: number;
  /** Reasoning effort hint passed to the provider, or null to omit. */
  reasoningEffort: 'low' | 'medium' | 'high' | null;
  /** Per-tool character limits for tool output truncation. */
  toolOutputLimits: Record<string, number>;
  /** Per-tool line limits for tool output truncation. */
  toolLineLimits: Record<string, number>;
  /** Whether the automatic loop detector is enabled. */
  enableLoopDetection: boolean;
  /** Number of recent tool-result turns inspected by the loop detector. */
  loopDetectionWindow: number;
  /** Maximum nesting depth for subagent spawning. */
  maxSubagentDepth: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxTurns: 0,
  maxToolRoundsPerInput: 0,
  defaultCommandTimeoutMs: 10_000,
  maxCommandTimeoutMs: 600_000,
  reasoningEffort: null,
  toolOutputLimits: {
    read_file: 50_000,
    shell: 30_000,
    grep: 20_000,
    glob: 20_000,
    edit_file: 10_000,
    apply_patch: 10_000,
    write_file: 1_000,
    spawn_agent: 20_000,
  },
  toolLineLimits: {
    shell: 256,
    grep: 200,
    glob: 500,
  },
  enableLoopDetection: true,
  loopDetectionWindow: 10,
  maxSubagentDepth: 1,
};

// ---------------------------------------------------------------------------
// Merge helper
// ---------------------------------------------------------------------------

/**
 * Create a complete {@link SessionConfig} by merging a partial override on
 * top of the default values.  Nested `Record` fields are shallow-merged so
 * that callers can override individual tool limits without replacing the
 * entire map.
 */
export function mergeSessionConfig(
  partial: Partial<SessionConfig>,
): SessionConfig {
  return {
    ...DEFAULT_SESSION_CONFIG,
    ...partial,
    toolOutputLimits: {
      ...DEFAULT_SESSION_CONFIG.toolOutputLimits,
      ...partial.toolOutputLimits,
    },
    toolLineLimits: {
      ...DEFAULT_SESSION_CONFIG.toolLineLimits,
      ...partial.toolLineLimits,
    },
  };
}
