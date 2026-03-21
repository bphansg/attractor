/**
 * @attractor/agent — Provider Profile
 *
 * A provider profile encapsulates model-specific capabilities, prompt
 * construction, and tool definitions.  Concrete profiles (e.g. Anthropic,
 * OpenAI) implement this interface to align tool schemas and system prompts
 * with each provider's conventions.
 */

import type { Tool } from '@attractor/llm';
import type { ExecutionEnvironment } from '../env/interface.js';

export interface ProviderProfile {
  /** Unique identifier for this profile (e.g. "anthropic-claude-sonnet"). */
  id: string;
  /** The model name to pass in LLM requests. */
  model: string;
  /** Maximum context window size in tokens. */
  contextWindowSize: number;
  /** Whether the model supports extended thinking / reasoning. */
  supportsReasoning: boolean;
  /** Whether the model supports streaming responses. */
  supportsStreaming: boolean;
  /** Whether the model can issue multiple tool calls in a single turn. */
  supportsParallelToolCalls: boolean;

  /**
   * Build the full system prompt given the current execution environment and
   * any project-level documentation snippets.
   */
  buildSystemPrompt(
    environment: ExecutionEnvironment,
    projectDocs: string[],
  ): string;

  /** Return the set of tools available for this provider profile. */
  tools(): Tool[];

  /** Return provider-specific options to include in the LLM request, if any. */
  providerOptions(): Record<string, unknown> | undefined;
}
