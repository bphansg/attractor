// @attractor/llm — HTTP Client Wrapper
// Fetch-based HTTP client with automatic auth headers, timeout, and error mapping.

import {
  errorFromStatusCode,
  NetworkError,
  RequestTimeoutError,
  AbortError,
} from '../errors/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HttpConfig {
  baseUrl: string;
  apiKey: string;
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds. Defaults to 60 000 (60 s). */
  timeout?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

// ── Default timeout ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000;

// ── HttpClient ───────────────────────────────────────────────────────────────

export class HttpClient {
  constructor(private readonly config: HttpConfig) {}

  /**
   * Send a JSON POST request and return the parsed response body.
   */
  async post<T = unknown>(
    path: string,
    body: unknown,
    options?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<HttpResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const headers = this.buildHeaders(options?.headers);
    headers['content-type'] = 'application/json';

    const { signal, clearTimeout: cleanup } = this.createTimeoutSignal(options?.signal);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        await this.throwForStatus(res);
      }

      const data = (await res.json()) as T;
      return {
        status: res.status,
        headers: extractHeaders(res.headers),
        data,
      };
    } catch (error) {
      throw this.wrapError(error);
    } finally {
      cleanup();
    }
  }

  /**
   * Send a POST request expecting a streaming response body.
   * Returns a ReadableStream of raw bytes (for SSE parsing).
   */
  async postStream(
    path: string,
    body: unknown,
    options?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.config.baseUrl}${path}`;
    const headers = this.buildHeaders(options?.headers);
    headers['content-type'] = 'application/json';

    const { signal, clearTimeout: cleanup } = this.createTimeoutSignal(options?.signal);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        cleanup();
        await this.throwForStatus(res);
      }

      if (!res.body) {
        cleanup();
        throw new NetworkError('Response body is null — streaming not supported');
      }

      // Cleanup timeout when the stream finishes or errors.
      // We cannot cancel on a per-chunk timer basis here; the initial
      // timeout only covers the connection establishment. Consumers can
      // pass their own AbortSignal for per-chunk timeouts.
      const reader = res.body.getReader();
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              cleanup();
              controller.close();
            } else {
              controller.enqueue(value);
            }
          } catch (err) {
            cleanup();
            controller.error(err);
          }
        },
        cancel() {
          cleanup();
          reader.cancel().catch(() => {});
        },
      });
    } catch (error) {
      cleanup();
      throw this.wrapError(error);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      ...this.config.defaultHeaders,
      authorization: `Bearer ${this.config.apiKey}`,
      ...extra,
    };
  }

  /**
   * Create a combined AbortSignal that fires on the earlier of:
   * - The configured timeout
   * - The caller-supplied signal (if any)
   *
   * Returns a cleanup function to clear the timer.
   */
  private createTimeoutSignal(callerSignal?: AbortSignal): {
    signal: AbortSignal;
    clearTimeout: () => void;
  } {
    const timeoutMs = this.config.timeout ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new RequestTimeoutError('Request timed out')), timeoutMs);

    // If the caller also supplied a signal, abort our controller when it fires.
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    return {
      signal: controller.signal,
      clearTimeout: () => {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', onCallerAbort);
      },
    };
  }

  /**
   * Read the error body and throw the appropriate SDKError subclass.
   */
  private async throwForStatus(res: FetchResponse): Promise<never> {
    let raw: unknown;
    let message: string;
    let errorCode: string | undefined;

    try {
      raw = await res.json();
      const body = raw as Record<string, unknown>;
      const err = body['error'] as Record<string, unknown> | undefined;
      message = (err?.['message'] as string) ?? res.statusText;
      errorCode = (err?.['code'] as string) ?? (err?.['type'] as string) ?? undefined;
    } catch {
      message = res.statusText || `HTTP ${res.status}`;
    }

    let retryAfter: number | undefined;
    const retryAfterHeader = res.headers.get('retry-after');
    if (retryAfterHeader) {
      const parsed = Number(retryAfterHeader);
      if (!Number.isNaN(parsed)) {
        retryAfter = parsed;
      }
    }

    throw errorFromStatusCode(res.status, message, {
      provider: 'unknown', // Callers (provider adapters) should catch and re-throw with proper provider.
      errorCode,
      retryAfter,
      raw,
    });
  }

  /**
   * Wrap native fetch errors into SDKError subclasses.
   */
  private wrapError(error: unknown): unknown {
    // Already an SDK error — pass through.
    if (error instanceof RequestTimeoutError || error instanceof AbortError || error instanceof NetworkError) {
      return error;
    }

    // Re-throw our own mapped provider errors from throwForStatus.
    if (error instanceof Error && error.name !== 'TypeError' && error.name !== 'AbortError') {
      return error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      // Check if this was caused by our timeout.
      if (error.message?.includes('timed out')) {
        return new RequestTimeoutError('Request timed out', { cause: error });
      }
      return new AbortError('Request was aborted', { cause: error });
    }

    if (error instanceof TypeError) {
      // fetch throws TypeError for network failures.
      return new NetworkError(error.message || 'Network request failed', { cause: error });
    }

    return error;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
