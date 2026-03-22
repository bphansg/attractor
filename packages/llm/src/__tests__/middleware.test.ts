import { describe, it, expect } from 'vitest';
import { applyMiddleware } from '../middleware.js';
import type { Middleware, NextFn } from '../middleware.js';
import type { Request, Response } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(model: string): Request {
  return { model, messages: [] };
}

function makeResponse(model: string): Response {
  return {
    id: 'resp-1',
    model,
    text: '',
    content: [],
    toolCalls: [],
    finishReason: 'stop',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

/** A mock final handler that echoes the request model back in the response. */
const echoHandler: NextFn = async (request: Request) => makeResponse(request.model);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyMiddleware', () => {
  it('returns response unchanged with zero middlewares', async () => {
    const handler = applyMiddleware([], echoHandler);
    const response = await handler(makeRequest('gpt-4o'));

    expect(response.model).toBe('gpt-4o');
  });

  it('allows a single middleware to modify the request model name', async () => {
    const renameModel: Middleware = async (request, next) => {
      return next({ ...request, model: 'claude-sonnet' });
    };

    const handler = applyMiddleware([renameModel], echoHandler);
    const response = await handler(makeRequest('gpt-4o'));

    expect(response.model).toBe('claude-sonnet');
  });

  it('executes two middlewares in correct onion order', async () => {
    const order: string[] = [];

    const outer: Middleware = async (request, next) => {
      order.push('outer-before');
      const response = await next(request);
      order.push('outer-after');
      return response;
    };

    const inner: Middleware = async (request, next) => {
      order.push('inner-before');
      const response = await next(request);
      order.push('inner-after');
      return response;
    };

    const handler = applyMiddleware([outer, inner], echoHandler);
    await handler(makeRequest('test-model'));

    expect(order).toEqual([
      'outer-before',
      'inner-before',
      'inner-after',
      'outer-after',
    ]);
  });

  it('allows middleware to modify the response before returning it', async () => {
    const addMetadata: Middleware = async (request, next) => {
      const response = await next(request);
      return {
        ...response,
        text: 'modified-text',
        providerMetadata: { injected: true },
      };
    };

    const handler = applyMiddleware([addMetadata], echoHandler);
    const response = await handler(makeRequest('gpt-4o'));

    expect(response.text).toBe('modified-text');
    expect(response.providerMetadata).toEqual({ injected: true });
  });
});
