// @attractor/llm — Anthropic Provider Adapter
// Implements the ProviderAdapter interface for the Anthropic Messages API.

import type { ProviderAdapter } from '../adapter.js';
import type { Request } from '../../types/request.js';
import type { Response } from '../../types/response.js';
import type { StreamEvent } from '../../types/stream.js';
import { HttpClient } from '../../utils/http.js';
import { parseSSEStream } from '../../utils/sse.js';
import { translateRequest } from './translate-request.js';
import { translateResponse, type AnthropicResponseBody } from './translate-response.js';
import { translateStream } from './translate-stream.js';

// ── Config ──────────────────────────────────────────────────────────────────

export interface AnthropicAdapterConfig {
  /** Anthropic API key. */
  apiKey: string;
  /** Base URL for the API. Defaults to https://api.anthropic.com */
  baseUrl?: string;
  /** Additional default headers to include in every request. */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Beta feature headers (e.g., ["prompt-caching-2024-07-31"]). */
  betaHeaders?: string[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const MESSAGES_PATH = '/v1/messages';

// ── Adapter ─────────────────────────────────────────────────────────────────

export class AnthropicAdapter implements ProviderAdapter {
  readonly name = 'anthropic';
  private readonly http: HttpClient;
  private readonly betaHeaders: string[];

  constructor(private readonly config: AnthropicAdapterConfig) {
    this.betaHeaders = config.betaHeaders ?? [];

    // Build default headers for every request.
    // Anthropic uses x-api-key instead of Authorization: Bearer.
    const defaultHeaders: Record<string, string> = {
      'x-api-key': config.apiKey,
      'anthropic-version': API_VERSION,
      ...config.defaultHeaders,
    };

    if (this.betaHeaders.length > 0) {
      defaultHeaders['anthropic-beta'] = this.betaHeaders.join(',');
    }

    this.http = new HttpClient({
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      // HttpClient.buildHeaders sets Authorization: Bearer by default.
      // We override it by setting the apiKey to a dummy value and
      // relying on our x-api-key header. The authorization header
      // won't interfere with Anthropic's API.
      apiKey: config.apiKey,
      defaultHeaders,
      timeout: config.timeout,
    });
  }

  /**
   * Send a non-streaming completion request to the Anthropic Messages API.
   */
  async complete(request: Request): Promise<Response> {
    const body = translateRequest(request, { stream: false });
    const httpResponse = await this.http.post<AnthropicResponseBody>(
      MESSAGES_PATH,
      body,
      { headers: this.buildRequestHeaders() },
    );
    return translateResponse(httpResponse.data);
  }

  /**
   * Send a streaming request to the Anthropic Messages API and yield
   * unified StreamEvent objects as they arrive.
   */
  async *stream(request: Request): AsyncGenerator<StreamEvent> {
    const body = translateRequest(request, { stream: true });
    const rawStream = await this.http.postStream(
      MESSAGES_PATH,
      body,
      { headers: this.buildRequestHeaders() },
    );
    const sseEvents = parseSSEStream(rawStream);
    yield* translateStream(sseEvents);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build per-request headers. These override the client-level defaults
   * if needed. Currently returns an empty object since all standard
   * headers are set at the HttpClient level.
   */
  private buildRequestHeaders(): Record<string, string> {
    return {};
  }
}
