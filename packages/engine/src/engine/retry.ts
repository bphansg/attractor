import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Handler } from '../handlers/interface.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';
import { createOutcome } from '../state/outcome.js';

export interface BackoffConfig {
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoff: BackoffConfig;
  shouldRetry: (error: unknown) => boolean;
}

/**
 * Build a RetryPolicy from a node's maxRetries (falling back to graph defaults).
 */
export function buildRetryPolicy(node: GraphNode, graph: Graph): RetryPolicy {
  const maxRetries = node.maxRetries > 0 ? node.maxRetries : graph.defaultMaxRetries;
  return {
    maxAttempts: Math.max(1, maxRetries + 1),
    backoff: {
      initialDelayMs: 1000,
      backoffFactor: 2,
      maxDelayMs: 30_000,
      jitter: true,
    },
    shouldRetry: () => true,
  };
}

/**
 * Compute the delay in milliseconds for a given attempt (1-based).
 */
export function delayForAttempt(attempt: number, config: BackoffConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt - 1);
  const capped = Math.min(exponentialDelay, config.maxDelayMs);
  if (!config.jitter) {
    return capped;
  }
  // Full jitter: random value between 0 and capped
  return Math.floor(Math.random() * capped);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a handler with retry logic.
 *
 * - Loop from 1 to maxAttempts
 * - On exception: retry if shouldRetry returns true and attempts remain
 * - On SUCCESS/PARTIAL_SUCCESS: return immediately
 * - On RETRY: increment counter, delay, continue
 * - On FAIL: return immediately
 * - On exhaustion: if node.allowPartial, return PARTIAL_SUCCESS; else FAIL
 */
export async function executeWithRetry(
  handler: Handler,
  node: GraphNode,
  context: Context,
  graph: Graph,
  logsRoot: string,
  policy: RetryPolicy,
): Promise<Outcome> {
  let lastOutcome: Outcome | undefined;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      const outcome = await handler.execute(node, context, graph, logsRoot);
      lastOutcome = outcome;

      switch (outcome.status) {
        case 'success':
        case 'partial_success':
          return outcome;

        case 'fail':
          return outcome;

        case 'retry':
          if (attempt < policy.maxAttempts) {
            const delay = delayForAttempt(attempt, policy.backoff);
            if (delay > 0) {
              await sleep(delay);
            }
            continue;
          }
          break;

        default:
          // skipped or unknown — treat like success, pass through
          return outcome;
      }
    } catch (error: unknown) {
      if (attempt < policy.maxAttempts && policy.shouldRetry(error)) {
        const delay = delayForAttempt(attempt, policy.backoff);
        if (delay > 0) {
          await sleep(delay);
        }
        continue;
      }

      // No more retries — fall through to exhaustion
      const message = error instanceof Error ? error.message : String(error);
      lastOutcome = createOutcome({
        status: 'fail',
        failureReason: `Exception after ${attempt} attempt(s): ${message}`,
      });
    }
  }

  // Exhaustion
  if (node.allowPartial) {
    return createOutcome({
      status: 'partial_success',
      notes: `Exhausted ${policy.maxAttempts} attempt(s); returning partial success`,
      failureReason: lastOutcome?.failureReason ?? '',
    });
  }

  return lastOutcome ?? createOutcome({
    status: 'fail',
    failureReason: `Exhausted ${policy.maxAttempts} attempt(s)`,
  });
}
