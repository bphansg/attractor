/**
 * @attractor/llm — Error Types
 *
 * Full error hierarchy for the unified LLM client. All errors extend from
 * SDKError, with provider-specific errors extending ProviderError.
 */

// ---------------------------------------------------------------------------
// Base errors
// ---------------------------------------------------------------------------

/** Base error for all @attractor/llm errors. */
export class SDKError extends Error {
  override readonly name: string = 'SDKError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    // Restore prototype chain (required when extending built-ins).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Error originating from an LLM provider API. */
export class ProviderError extends SDKError {
  override readonly name: string = 'ProviderError';

  /** HTTP status code from the provider, if available. */
  readonly statusCode?: number;
  /** Whether the request can be retried. */
  readonly retryable: boolean;
  /** Suggested delay (in milliseconds) before retrying. */
  readonly retryAfter?: number;
  /** The provider that returned the error (e.g., "openai", "anthropic"). */
  readonly provider?: string;
  /** Provider-assigned request identifier for debugging. */
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      retryable?: boolean;
      retryAfter?: number;
      provider?: string;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
    this.provider = options.provider;
    this.requestId = options.requestId;
  }
}

// ---------------------------------------------------------------------------
// Provider errors
// ---------------------------------------------------------------------------

/** The API key or credentials are invalid or missing. */
export class AuthenticationError extends ProviderError {
  override readonly name: string = 'AuthenticationError';

  constructor(
    message: string,
    options: {
      statusCode?: number;
      provider?: string;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { ...options, statusCode: options.statusCode ?? 401, retryable: false });
  }
}

/** The provider is rate limiting requests. */
export class RateLimitError extends ProviderError {
  override readonly name: string = 'RateLimitError';

  constructor(
    message: string,
    options: {
      statusCode?: number;
      retryAfter?: number;
      provider?: string;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 429,
      retryable: true,
      retryAfter: options.retryAfter,
    });
  }
}

/** The request exceeds the model's context length. */
export class ContextLengthError extends ProviderError {
  override readonly name: string = 'ContextLengthError';

  constructor(
    message: string,
    options: {
      statusCode?: number;
      provider?: string;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { ...options, retryable: false });
  }
}

/** The provider refused to generate content due to safety filters. */
export class ContentFilterError extends ProviderError {
  override readonly name: string = 'ContentFilterError';

  constructor(
    message: string,
    options: {
      statusCode?: number;
      provider?: string;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { ...options, retryable: false });
  }
}

/** The request was malformed or contained invalid parameters. */
export class InvalidRequestError extends ProviderError {
  override readonly name: string = 'InvalidRequestError';

  constructor(
    message: string,
    options: {
      statusCode?: number;
      provider?: string;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { ...options, statusCode: options.statusCode ?? 400, retryable: false });
  }
}

/** The provider experienced an internal server error. */
export class ServerError extends ProviderError {
  override readonly name: string = 'ServerError';

  constructor(
    message: string,
    options: {
      statusCode?: number;
      provider?: string;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { ...options, statusCode: options.statusCode ?? 500, retryable: true });
  }
}

// ---------------------------------------------------------------------------
// SDK-level errors (not provider-specific)
// ---------------------------------------------------------------------------

/** A network-level error (DNS, connection refused, etc.). */
export class NetworkError extends SDKError {
  override readonly name: string = 'NetworkError';
  readonly retryable: boolean = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The request timed out before receiving a response. */
export class TimeoutError extends SDKError {
  override readonly name: string = 'TimeoutError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** Input validation failed before sending the request. */
export class ValidationError extends SDKError {
  override readonly name: string = 'ValidationError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The SDK is misconfigured (e.g., missing API key, invalid provider). */
export class ConfigurationError extends SDKError {
  override readonly name: string = 'ConfigurationError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
