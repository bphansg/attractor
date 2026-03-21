// @attractor/llm — Provider Adapter Interface

import type { Request, Response, StreamEvent } from '../types/index.js';

/**
 * Contract that every LLM provider must implement.
 *
 * Provider adapters translate between the unified Request/Response types
 * and the vendor-specific SDK calls.  The client dispatches to one of
 * these based on the request's `provider` field or the configured default.
 */
export interface ProviderAdapter {
  /** Canonical provider name, e.g. "openai", "anthropic", "gemini". */
  readonly name: string;

  /** Send a request and return the complete response. */
  complete(request: Request): Promise<Response>;

  /** Send a request and yield streaming events as they arrive. */
  stream(request: Request): AsyncGenerator<StreamEvent>;

  // ── Optional lifecycle methods ──────────────────────────────────────

  /** Called once when the provider is first registered (lazy SDK init, etc.). */
  initialize?(): Promise<void>;

  /** Tear down connections / release resources. */
  close?(): Promise<void>;

  /**
   * Check whether this provider supports a given tool-choice mode.
   * Useful so the client can surface clear errors before making a network call.
   */
  supportsToolChoice?(mode: string): boolean;
}
