/**
 * @attractor/agent — Session
 *
 * The Session is the primary stateful object representing an ongoing
 * conversation between a user and the coding agent.  It holds the turn
 * history, configuration, LLM client, and orchestrates the agentic loop.
 */

import { randomUUID } from 'node:crypto';
import type { Client, ToolCall, ToolResult } from '@attractor/llm';
import type { SessionConfig } from './session-config.js';
import { mergeSessionConfig } from './session-config.js';
import type { ProviderProfile } from './profiles/profile.js';
import type { ExecutionEnvironment } from './env/interface.js';
import { EventEmitter } from './events.js';
import type { SubAgentHandle } from './subagent.js';
import { processInput } from './loop.js';

// ---------------------------------------------------------------------------
// Session state machine
// ---------------------------------------------------------------------------

export type SessionState = 'idle' | 'processing' | 'awaiting_input' | 'closed';

// ---------------------------------------------------------------------------
// Turn types
// ---------------------------------------------------------------------------

export interface UserTurn {
  type: 'user';
  content: string;
  timestamp: Date;
}

export interface AssistantTurn {
  type: 'assistant';
  content: string;
  toolCalls: ToolCall[];
  reasoning: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  responseId: string | null;
  timestamp: Date;
}

export interface ToolResultsTurn {
  type: 'tool_results';
  results: ToolResult[];
  timestamp: Date;
}

export interface SystemTurn {
  type: 'system';
  content: string;
  timestamp: Date;
}

export interface SteeringTurn {
  type: 'steering';
  content: string;
  timestamp: Date;
}

export type Turn =
  | UserTurn
  | AssistantTurn
  | ToolResultsTurn
  | SystemTurn
  | SteeringTurn;

// ---------------------------------------------------------------------------
// Session options
// ---------------------------------------------------------------------------

export interface SessionOptions {
  client: Client;
  profile: ProviderProfile;
  executionEnv: ExecutionEnvironment;
  config?: Partial<SessionConfig>;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export class Session {
  readonly id: string;
  state: SessionState;
  history: Turn[];
  config: SessionConfig;
  llmClient: Client;
  providerProfile: ProviderProfile;
  executionEnv: ExecutionEnvironment;
  eventEmitter: EventEmitter;
  steeringQueue: string[];
  followupQueue: string[];
  abortController: AbortController;
  private subagents: Map<string, SubAgentHandle>;

  constructor(options: SessionOptions) {
    this.id = randomUUID();
    this.state = 'idle';
    this.history = [];
    this.config = mergeSessionConfig(options.config ?? {});
    this.llmClient = options.client;
    this.providerProfile = options.profile;
    this.executionEnv = options.executionEnv;
    this.eventEmitter = new EventEmitter();
    this.steeringQueue = [];
    this.followupQueue = [];
    this.abortController = new AbortController();
    this.subagents = new Map();
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Submit user input and run the agentic loop until the agent produces a
   * final text response (or hits a limit / abort).
   */
  async submit(input: string): Promise<void> {
    if (this.state === 'closed') {
      throw new Error('Cannot submit to a closed session.');
    }
    if (this.state === 'processing') {
      throw new Error('Session is already processing a request.');
    }

    this.state = 'processing';
    this.eventEmitter.emit('user.input', this.id, { input });

    try {
      await processInput(this, input);
    } finally {
      if ((this.state as SessionState) !== 'closed') {
        this.state = 'idle';
      }
      this.eventEmitter.emit('processing.end', this.id);
    }
  }

  /**
   * Inject a steering message that will be appended before the next LLM
   * call within the current processing loop.
   */
  steer(message: string): void {
    this.steeringQueue.push(message);
  }

  /**
   * Queue a follow-up user message to be processed after the current input
   * completes.
   */
  followUp(message: string): void {
    this.followupQueue.push(message);
  }

  /**
   * Abort the current processing loop.
   */
  abort(): void {
    this.abortController.abort();
    // Replace the controller so subsequent runs get a fresh signal.
    this.abortController = new AbortController();
  }

  /**
   * Close the session, releasing resources and preventing further use.
   */
  async close(): Promise<void> {
    this.abort();
    this.state = 'closed';

    // Abort all subagents.
    for (const handle of this.subagents.values()) {
      handle.session.abort();
    }
    this.subagents.clear();

    this.eventEmitter.emit('session.end', this.id);
  }

  // ── Subagent management (internal) ──────────────────────────────────

  /** @internal */
  registerSubagent(handle: SubAgentHandle): void {
    this.subagents.set(handle.id, handle);
  }

  /** @internal */
  getSubagent(id: string): SubAgentHandle | undefined {
    return this.subagents.get(id);
  }

  /** @internal */
  removeSubagent(id: string): void {
    this.subagents.delete(id);
  }
}
