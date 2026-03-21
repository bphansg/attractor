// @attractor/llm — Main Client

import type { Request, Response, StreamEvent } from './types/index.js';
import type { ProviderAdapter } from './providers/adapter.js';
import type { Middleware, StreamMiddleware } from './middleware.js';
import { applyMiddleware, applyStreamMiddleware } from './middleware.js';
import { OpenAIAdapter } from './providers/openai/adapter.js';
import { AnthropicAdapter } from './providers/anthropic/adapter.js';
import { GeminiAdapter } from './providers/gemini/adapter.js';
import { ConfigurationError } from './errors/index.js';


// ── Config ──────────────────────────────────────────────────────────

export interface ClientConfig {
  /** Named provider adapters keyed by provider name. */
  providers?: Record<string, ProviderAdapter>;
  /** Which provider to use when the request doesn't specify one. */
  defaultProvider?: string;
  /** Middleware applied to every complete() call. */
  middleware?: Middleware[];
  /** Middleware applied to every stream() call. */
  streamMiddleware?: StreamMiddleware[];
}

// ── Client ──────────────────────────────────────────────────────────

export class Client {
  private readonly providers: Map<string, ProviderAdapter>;
  private defaultProvider: string | undefined;
  private readonly middleware: Middleware[];
  private readonly streamMiddleware: StreamMiddleware[];

  constructor(config?: ClientConfig) {
    this.providers = new Map();
    this.middleware = config?.middleware ?? [];
    this.streamMiddleware = config?.streamMiddleware ?? [];
    this.defaultProvider = config?.defaultProvider;

    if (config?.providers) {
      for (const [name, adapter] of Object.entries(config.providers)) {
        this.providers.set(name, adapter);
      }
    }

    // If no explicit default was given, use the first registered provider.
    if (!this.defaultProvider && this.providers.size > 0) {
      this.defaultProvider = this.providers.keys().next().value as string;
    }
  }

  // ── Environment-based factory ───────────────────────────────────

  /**
   * Create a client by inspecting well-known environment variables.
   *
   * Auto-registers provider adapters whose API keys are present:
   *
   * - `OPENAI_API_KEY`                      -> openai adapter
   * - `ANTHROPIC_API_KEY`                   -> anthropic adapter
   * - `GEMINI_API_KEY` / `GOOGLE_API_KEY`   -> gemini adapter
   *
   * The first detected provider becomes the default.
   */
  static fromEnv(): Client {
    const providers: Record<string, ProviderAdapter> = {};

    if (process.env['OPENAI_API_KEY']) {
      providers.openai = new OpenAIAdapter({
        apiKey: process.env['OPENAI_API_KEY'],
        baseUrl: process.env['OPENAI_BASE_URL'],
        organization: process.env['OPENAI_ORG_ID'],
        project: process.env['OPENAI_PROJECT_ID'],
      });
    }

    if (process.env['ANTHROPIC_API_KEY']) {
      providers.anthropic = new AnthropicAdapter({
        apiKey: process.env['ANTHROPIC_API_KEY'],
        baseUrl: process.env['ANTHROPIC_BASE_URL'],
      });
    }

    if (process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY']) {
      providers.gemini = new GeminiAdapter({
        apiKey: (process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY'])!,
        baseUrl: process.env['GEMINI_BASE_URL'],
      });
    }

    const names = Object.keys(providers);
    if (names.length === 0) {
      throw new ConfigurationError(
        'Client.fromEnv(): No API keys found in the environment. ' +
          'Set at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, ' +
          'GEMINI_API_KEY, or GOOGLE_API_KEY.',
      );
    }

    return new Client({ providers, defaultProvider: names[0] });
  }

  // ── Provider management ─────────────────────────────────────────

  /**
   * Register (or replace) a named provider adapter.
   *
   * The first registered adapter automatically becomes the default
   * unless one was explicitly set.
   */
  registerProvider(name: string, adapter: ProviderAdapter): void {
    this.providers.set(name, adapter);

    if (!this.defaultProvider) {
      this.defaultProvider = name;
    }
  }

  // ── Core: complete ──────────────────────────────────────────────

  /**
   * Send a request and return the full response.
   *
   * The request flows through all registered middleware before reaching
   * the provider adapter.
   */
  async complete(request: Request): Promise<Response> {
    const provider = this.resolveProvider(request);

    const finalHandler = async (req: Request): Promise<Response> =>
      provider.complete(req);

    const handler = applyMiddleware(this.middleware, finalHandler);
    return handler(request);
  }

  // ── Core: stream ────────────────────────────────────────────────

  /**
   * Send a request and stream back events as they arrive.
   *
   * The request flows through all registered stream middleware before
   * reaching the provider adapter.
   */
  async *stream(request: Request): AsyncGenerator<StreamEvent> {
    const provider = this.resolveProvider(request);

    const finalHandler = (req: Request): AsyncGenerator<StreamEvent> =>
      provider.stream(req);

    const handler = applyStreamMiddleware(this.streamMiddleware, finalHandler);
    yield* handler(request);
  }

  // ── Provider resolution ─────────────────────────────────────────

  private resolveProvider(request: Request): ProviderAdapter {
    const name = request.provider ?? this.defaultProvider;

    if (!name) {
      throw new Error(
        'No provider specified in the request and no default provider is configured. ' +
          'Register at least one provider via registerProvider().',
      );
    }

    const adapter = this.providers.get(name);
    if (!adapter) {
      const available = [...this.providers.keys()];
      throw new Error(
        `Provider "${name}" is not registered. ` +
          (available.length > 0
            ? `Available providers: [${available.join(', ')}].`
            : 'No providers are registered.'),
      );
    }

    return adapter;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  /**
   * Gracefully close all registered provider adapters.
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    for (const adapter of this.providers.values()) {
      if (adapter.close) {
        closePromises.push(adapter.close());
      }
    }
    await Promise.all(closePromises);
  }
}

// ── Module-level default client ───────────────────────────────────

let defaultClient: Client | undefined;

/**
 * Return the module-level default client.
 *
 * If none has been set explicitly via {@link setDefaultClient}, a new
 * empty client is created (no providers registered).
 */
export function getDefaultClient(): Client {
  if (!defaultClient) {
    defaultClient = new Client();
  }
  return defaultClient;
}

/**
 * Replace the module-level default client.
 */
export function setDefaultClient(client: Client): void {
  defaultClient = client;
}
