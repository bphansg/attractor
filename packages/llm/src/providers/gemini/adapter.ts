// @attractor/llm — Gemini Provider Adapter
// Implements the ProviderAdapter interface for Google's Gemini API
// using the native generateContent endpoint.

import type { ProviderAdapter } from '../adapter.js';
import type { Request } from '../../types/request.js';
import type { Response } from '../../types/response.js';
import type { StreamEvent } from '../../types/stream.js';
import { HttpClient } from '../../utils/http.js';
import { parseSSEStream } from '../../utils/sse.js';
import { translateRequest } from './translate-request.js';
import { translateResponse } from './translate-response.js';
import type { GeminiResponse } from './translate-response.js';
import { translateStream } from './translate-stream.js';
import { ProviderError } from '../../errors/index.js';

// ── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiAdapterConfig {
  /** Gemini API key. */
  apiKey: string;
  /** Base URL for the Gemini API. Defaults to the v1beta endpoint. */
  baseUrl?: string;
  /** Additional headers to include with every request. */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds. */
  timeout?: number;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini';
  private readonly http: HttpClient;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: GeminiAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

    // Gemini uses query-parameter auth, not Bearer tokens.
    // We still use HttpClient for networking, but pass a dummy apiKey
    // since Gemini doesn't use the Authorization header.
    // We'll append ?key= to the URL path instead.
    this.http = new HttpClient({
      baseUrl: this.baseUrl,
      apiKey: '', // Not used — Gemini authenticates via query param.
      defaultHeaders: {
        ...config.defaultHeaders,
      },
      timeout: config.timeout,
    });
  }

  /**
   * Send a non-streaming generateContent request and return the unified Response.
   */
  async complete(request: Request): Promise<Response> {
    const body = translateRequest(request);
    const path = `/models/${request.model}:generateContent?key=${this.apiKey}`;

    try {
      const httpResponse = await this.http.post<GeminiResponse>(path, body, {
        headers: {
          // Override the empty Authorization header set by HttpClient.
          authorization: '',
        },
      });

      return translateResponse(httpResponse.data, request.model);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Send a streaming generateContent request and yield unified StreamEvents.
   */
  async *stream(request: Request): AsyncGenerator<StreamEvent> {
    const body = translateRequest(request);
    const path = `/models/${request.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    let rawStream: ReadableStream<Uint8Array>;

    try {
      rawStream = await this.http.postStream(path, body, {
        headers: {
          authorization: '',
        },
      });
    } catch (error) {
      throw this.wrapError(error);
    }

    const sseEvents = parseSSEStream(rawStream);
    yield* translateStream(sseEvents, request.model);
  }

  /**
   * Gemini supports all standard tool choice modes.
   */
  supportsToolChoice(mode: string): boolean {
    return ['auto', 'none', 'required'].includes(mode);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Re-tag errors with the gemini provider name.
   */
  private wrapError(error: unknown): unknown {
    if (error instanceof ProviderError) {
      return new ProviderError(error.message, {
        provider: 'gemini',
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        retryable: error.retryable,
        retryAfter: error.retryAfter,
        raw: error.raw,
        cause: error,
      });
    }
    return error;
  }
}
