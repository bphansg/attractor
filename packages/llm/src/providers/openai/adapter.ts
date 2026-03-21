// @attractor/llm — OpenAI Provider Adapter
// Implements the ProviderAdapter interface using the OpenAI Responses API.

import type { ProviderAdapter } from '../adapter.js';
import type { Request, Response, StreamEvent } from '../../types/index.js';
import { HttpClient } from '../../utils/http.js';
import { ProviderError } from '../../errors/index.js';
import { translateRequest } from './translate-request.js';
import { translateResponse, type OpenAIResponseBody } from './translate-response.js';
import { translateStream } from './translate-stream.js';

// ── Configuration ────────────────────────────────────────────────────────────

export interface OpenAIAdapterConfig {
  /** OpenAI API key. */
  apiKey: string;
  /** Base URL for the API. Defaults to https://api.openai.com/v1. */
  baseUrl?: string;
  /** Additional headers to include in every request. */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** OpenAI organization ID. */
  organization?: string;
  /** OpenAI project ID. */
  project?: string;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * OpenAI provider adapter using the Responses API (`POST /v1/responses`).
 */
export class OpenAIAdapter implements ProviderAdapter {
  readonly name = 'openai';
  private readonly http: HttpClient;

  constructor(config: OpenAIAdapterConfig) {
    const headers: Record<string, string> = {
      ...config.defaultHeaders,
    };

    if (config.organization) {
      headers['openai-organization'] = config.organization;
    }
    if (config.project) {
      headers['openai-project'] = config.project;
    }

    this.http = new HttpClient({
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: config.apiKey,
      defaultHeaders: headers,
      timeout: config.timeout,
    });
  }

  /**
   * Send a non-streaming completion request.
   */
  async complete(request: Request): Promise<Response> {
    const body = translateRequest(request, false);

    try {
      const httpResponse = await this.http.post<OpenAIResponseBody>('/responses', body);
      return translateResponse(httpResponse.data);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Send a streaming completion request, yielding events as they arrive.
   */
  async *stream(request: Request): AsyncGenerator<StreamEvent> {
    const body = translateRequest(request, true);

    let byteStream: ReadableStream<Uint8Array>;
    try {
      byteStream = await this.http.postStream('/responses', body);
    } catch (error) {
      throw this.wrapError(error);
    }

    yield* translateStream(byteStream);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Re-tag provider errors with the correct provider name.
   */
  private wrapError(error: unknown): unknown {
    if (error instanceof ProviderError && error.provider === 'unknown') {
      return new ProviderError(error.message, {
        provider: this.name,
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        retryable: error.retryable,
        retryAfter: error.retryAfter,
        raw: error.raw,
        cause: error.cause,
      });
    }
    return error;
  }
}
