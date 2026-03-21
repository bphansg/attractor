// @attractor/llm — Retry with Exponential Backoff

import {
  RateLimitError,
  ServerError,
  NetworkError,
  StreamError,
  AuthenticationError,
  AccessDeniedError,
  InvalidRequestError,
  NotFoundError,
  ContentFilterError,
  ContextLengthError,
  QuotaExceededError,
  RequestTimeoutError,
  AbortError,
  ConfigurationError,
  InvalidToolCallError,
  UnsupportedToolChoiceError,
  NoObjectGeneratedError,
} from '../errors/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Maximum number of attempts (includes the initial attempt). */
  maxAttempts: number;
  /** Delay before the first retry, in milliseconds. */
  initialDelayMs: number;
  /** Multiplier applied to the delay after each attempt. */
  backoffFactor: number;
  /** Maximum delay between retries, in milliseconds. */
  maxDelayMs: number;
  /** Whether to add random jitter to the delay. */
  jitter: boolean;
  /** Predicate that decides whether a given error should be retried. */
  shouldRetry: (error: unknown) => boolean;
}

// ── Default shouldRetry ──────────────────────────────────────────────────────

/**
 * Default retry predicate. Retries transient errors (rate limits, server
 * errors, network errors, stream errors). Does not retry auth errors,
 * invalid requests, aborts, or configuration issues.
 */
export function defaultShouldRetry(error: unknown): boolean {
  // Non-retryable errors — fail fast.
  if (
    error instanceof AuthenticationError ||
    error instanceof AccessDeniedError ||
    error instanceof InvalidRequestError ||
    error instanceof NotFoundError ||
    error instanceof ContentFilterError ||
    error instanceof ContextLengthError ||
    error instanceof QuotaExceededError ||
    error instanceof RequestTimeoutError ||
    error instanceof AbortError ||
    error instanceof ConfigurationError ||
    error instanceof InvalidToolCallError ||
    error instanceof UnsupportedToolChoiceError ||
    error instanceof NoObjectGeneratedError
  ) {
    return false;
  }

  // Retryable errors.
  if (
    error instanceof RateLimitError ||
    error instanceof ServerError ||
    error instanceof NetworkError ||
    error instanceof StreamError
  ) {
    return true;
  }

  // Check the retryable property on objects that have it.
  if (typeof error === 'object' && error !== null && 'retryable' in error) {
    return Boolean((error as { retryable: unknown }).retryable);
  }

  // Unknown errors default to retryable (conservative choice per spec).
  return true;
}

// ── Presets ──────────────────────────────────────────────────────────────────

export const RETRY_PRESETS = {
  /** No retries — execute exactly once. */
  none: {
    maxAttempts: 1,
    initialDelayMs: 0,
    backoffFactor: 1,
    maxDelayMs: 0,
    jitter: false,
    shouldRetry: () => false,
  } satisfies RetryPolicy,

  /** Standard exponential backoff: 5 attempts, 200ms initial, 2x growth, 60s cap. */
  standard: {
    maxAttempts: 5,
    initialDelayMs: 200,
    backoffFactor: 2.0,
    maxDelayMs: 60_000,
    jitter: true,
    shouldRetry: defaultShouldRetry,
  } satisfies RetryPolicy,

  /** Aggressive: more attempts, shorter initial delay. */
  aggressive: {
    maxAttempts: 8,
    initialDelayMs: 100,
    backoffFactor: 1.5,
    maxDelayMs: 30_000,
    jitter: true,
    shouldRetry: defaultShouldRetry,
  } satisfies RetryPolicy,

  /** Linear backoff: fixed delay increment. */
  linear: {
    maxAttempts: 5,
    initialDelayMs: 500,
    backoffFactor: 1.0,
    maxDelayMs: 500,
    jitter: false,
    shouldRetry: defaultShouldRetry,
  } satisfies RetryPolicy,

  /** Patient: fewer retries but longer waits (good for rate limits). */
  patient: {
    maxAttempts: 4,
    initialDelayMs: 2_000,
    backoffFactor: 3.0,
    maxDelayMs: 120_000,
    jitter: true,
    shouldRetry: defaultShouldRetry,
  } satisfies RetryPolicy,
} as const;

// ── Delay calculation ────────────────────────────────────────────────────────

/**
 * Calculate the delay for a given retry attempt (0-indexed).
 * Attempt 0 = first retry (not the initial call).
 */
export function delayForAttempt(attempt: number, policy: RetryPolicy): number {
  const baseDelay = policy.initialDelayMs * Math.pow(policy.backoffFactor, attempt);
  const clamped = Math.min(baseDelay, policy.maxDelayMs);

  if (policy.jitter) {
    // Full jitter: uniform random in [0, clamped].
    return Math.floor(Math.random() * clamped);
  }

  return Math.floor(clamped);
}

// ── Core retry function ──────────────────────────────────────────────────────

/**
 * Execute `fn` with automatic retries according to the given policy.
 * Defaults to `RETRY_PRESETS.standard` if no policy is provided.
 *
 * Respects `retryAfter` on RateLimitError: if the provider says to wait
 * longer than `maxDelayMs`, the error is raised immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = RETRY_PRESETS.standard,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If this was the last attempt, or the error is non-retryable, throw.
      const isLastAttempt = attempt === policy.maxAttempts - 1;
      if (isLastAttempt || !policy.shouldRetry(error)) {
        throw error;
      }

      // Determine delay. Respect Retry-After from rate limit errors.
      let delay = delayForAttempt(attempt, policy);

      if (error instanceof RateLimitError && error.retryAfter != null) {
        const retryAfterMs = error.retryAfter * 1_000;
        if (retryAfterMs > policy.maxDelayMs) {
          // Provider asks us to wait longer than our max — raise immediately.
          throw error;
        }
        delay = Math.max(delay, retryAfterMs);
      }

      await sleep(delay);
    }
  }

  // Should be unreachable, but satisfy the type checker.
  throw lastError;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
