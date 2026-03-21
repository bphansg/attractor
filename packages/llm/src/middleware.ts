// @attractor/llm — Middleware Types & Chain Execution

import type { Request, Response, StreamEvent } from './types/index.js';

// ── Function signatures for the "next" slot in the chain ─────────────

/** The next handler in a complete() middleware chain. */
export type NextFn = (request: Request) => Promise<Response>;

/** The next handler in a stream() middleware chain. */
export type StreamNextFn = (request: Request) => AsyncGenerator<StreamEvent>;

// ── Middleware signatures ────────────────────────────────────────────

/**
 * A middleware intercepts a complete() call.
 *
 * It receives the (possibly mutated) request and a `next` function that
 * either calls the next middleware or the final provider handler.
 *
 * The middleware may:
 * - modify the request before calling next
 * - modify the response after calling next
 * - short-circuit the chain by returning its own Response
 */
export type Middleware = (request: Request, next: NextFn) => Promise<Response>;

/**
 * A middleware that intercepts a stream() call.
 *
 * Same semantics as {@link Middleware} but operates on the streaming path.
 */
export type StreamMiddleware = (
  request: Request,
  next: StreamNextFn,
) => AsyncGenerator<StreamEvent>;

// ── Config bag for convenience ──────────────────────────────────────

export interface MiddlewareConfig {
  middleware?: Middleware[];
  streamMiddleware?: StreamMiddleware[];
}

// ── Chain execution (onion / compose pattern) ───────────────────────

/**
 * Compose an array of middlewares into a single {@link NextFn}.
 *
 * Middlewares execute in registration order (first registered = outermost).
 * The `finalHandler` sits at the centre of the onion and typically calls
 * the provider adapter's `complete()` method.
 */
export function applyMiddleware(
  middlewares: Middleware[],
  finalHandler: NextFn,
): NextFn {
  // Walk from the innermost (last) middleware outward so that the first
  // middleware in the array is the first to execute.
  let handler = finalHandler;

  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i]!;
    const next = handler; // capture current handler for closure
    handler = (request: Request) => mw(request, next);
  }

  return handler;
}

/**
 * Compose an array of stream middlewares into a single {@link StreamNextFn}.
 *
 * Same onion semantics as {@link applyMiddleware} but for the streaming path.
 */
export function applyStreamMiddleware(
  middlewares: StreamMiddleware[],
  finalHandler: StreamNextFn,
): StreamNextFn {
  let handler = finalHandler;

  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i]!;
    const next = handler;
    handler = (request: Request) => mw(request, next);
  }

  return handler;
}
