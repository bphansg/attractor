import { describe, it, expect, vi } from 'vitest';
import {
  delayForAttempt,
  RETRY_PRESETS,
  withRetry,
} from '../utils/retry.js';
import type { RetryPolicy } from '../utils/retry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A deterministic (no-jitter) policy for predictable delay calculations. */
const testPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffFactor: 2,
  maxDelayMs: 1000,
  jitter: false,
  shouldRetry: () => true,
};

// ---------------------------------------------------------------------------
// delayForAttempt
// ---------------------------------------------------------------------------

describe('delayForAttempt', () => {
  it('returns initialDelayMs for attempt 0', () => {
    const delay = delayForAttempt(0, testPolicy);
    // 100 * 2^0 = 100
    expect(delay).toBe(100);
  });

  it('returns initialDelayMs * backoffFactor for attempt 1', () => {
    const delay = delayForAttempt(1, testPolicy);
    // 100 * 2^1 = 200
    expect(delay).toBe(200);
  });

  it('caps delay at maxDelayMs', () => {
    const delay = delayForAttempt(10, testPolicy);
    // 100 * 2^10 = 102400, capped at 1000
    expect(delay).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// RETRY_PRESETS
// ---------------------------------------------------------------------------

describe('RETRY_PRESETS', () => {
  it('none preset has maxAttempts = 1', () => {
    expect(RETRY_PRESETS.none.maxAttempts).toBe(1);
  });

  it('standard preset has maxAttempts = 5', () => {
    expect(RETRY_PRESETS.standard.maxAttempts).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  // Use fake timers so tests are fast and deterministic.
  it('succeeds on the first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, RETRY_PRESETS.none);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds on the second try', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered');

    const fastPolicy: RetryPolicy = {
      ...testPolicy,
      initialDelayMs: 0,
      maxDelayMs: 0,
    };

    const result = await withRetry(fn, fastPolicy);

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));

    const fastPolicy: RetryPolicy = {
      maxAttempts: 3,
      initialDelayMs: 0,
      backoffFactor: 1,
      maxDelayMs: 0,
      jitter: false,
      shouldRetry: () => true,
    };

    await expect(withRetry(fn, fastPolicy)).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
