// @attractor/llm — Error Hierarchy
// All library errors inherit from SDKError.

/**
 * Base error for all @attractor/llm errors.
 */
export class SDKError extends Error {
  override readonly name: string = 'SDKError';
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.cause = options?.cause;
    // Maintain proper prototype chain for instanceof checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Provider Errors ──────────────────────────────────────────────────────────

export class ProviderError extends SDKError {
  override readonly name: string = 'ProviderError';
  readonly provider: string;
  readonly statusCode: number | undefined;
  readonly errorCode: string | undefined;
  readonly retryable: boolean;
  readonly retryAfter: number | undefined;
  readonly raw: unknown;

  constructor(
    message: string,
    options: {
      provider: string;
      statusCode?: number;
      errorCode?: string;
      retryable?: boolean;
      retryAfter?: number;
      raw?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
    this.raw = options.raw;
  }
}

export class AuthenticationError extends ProviderError {
  override readonly name = 'AuthenticationError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: false });
  }
}

export class AccessDeniedError extends ProviderError {
  override readonly name = 'AccessDeniedError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: false });
  }
}

export class NotFoundError extends ProviderError {
  override readonly name = 'NotFoundError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: false });
  }
}

export class InvalidRequestError extends ProviderError {
  override readonly name = 'InvalidRequestError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: false });
  }
}

export class RateLimitError extends ProviderError {
  override readonly name = 'RateLimitError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: true });
  }
}

export class ServerError extends ProviderError {
  override readonly name = 'ServerError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: true });
  }
}

export class ContentFilterError extends ProviderError {
  override readonly name = 'ContentFilterError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: false });
  }
}

export class ContextLengthError extends ProviderError {
  override readonly name = 'ContextLengthError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: false });
  }
}

export class QuotaExceededError extends ProviderError {
  override readonly name = 'QuotaExceededError' as const;
  constructor(message: string, options: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, { ...options, retryable: false });
  }
}

// ── Non-Provider Errors ──────────────────────────────────────────────────────

export class RequestTimeoutError extends SDKError {
  override readonly name = 'RequestTimeoutError' as const;
  readonly retryable = false;
}

export class AbortError extends SDKError {
  override readonly name = 'AbortError' as const;
  readonly retryable = false;
}

export class NetworkError extends SDKError {
  override readonly name = 'NetworkError' as const;
  readonly retryable = true;
}

export class StreamError extends SDKError {
  override readonly name = 'StreamError' as const;
  readonly retryable = true;
}

export class InvalidToolCallError extends SDKError {
  override readonly name = 'InvalidToolCallError' as const;
  readonly retryable = false;
}

export class UnsupportedToolChoiceError extends SDKError {
  override readonly name = 'UnsupportedToolChoiceError' as const;
  readonly retryable = false;
}

export class NoObjectGeneratedError extends SDKError {
  override readonly name = 'NoObjectGeneratedError' as const;
  readonly retryable = false;
}

export class ConfigurationError extends SDKError {
  override readonly name = 'ConfigurationError' as const;
  readonly retryable = false;
}

// ── Status Code Mapping ──────────────────────────────────────────────────────

/**
 * Create the appropriate ProviderError subclass from an HTTP status code.
 */
export function errorFromStatusCode(
  statusCode: number,
  message: string,
  options: Omit<ConstructorParameters<typeof ProviderError>[1], 'statusCode'>,
): ProviderError {
  const opts = { ...options, statusCode };
  switch (statusCode) {
    case 400:
    case 422:
      return new InvalidRequestError(message, opts);
    case 401:
      return new AuthenticationError(message, opts);
    case 403:
      return new AccessDeniedError(message, opts);
    case 404:
      return new NotFoundError(message, opts);
    case 408:
      return new InvalidRequestError(message, opts); // Request timeout at HTTP level
    case 413:
      return new ContextLengthError(message, opts);
    case 429:
      return new RateLimitError(message, opts);
    default:
      if (statusCode >= 500 && statusCode < 600) {
        return new ServerError(message, opts);
      }
      // Unknown errors default to retryable per spec.
      return new ProviderError(message, { ...opts, retryable: true });
  }
}
