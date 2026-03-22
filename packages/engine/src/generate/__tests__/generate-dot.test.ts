import { describe, it, expect, vi } from 'vitest';
import { generateDot } from '../generate-dot.js';
import type { Client } from '@attractor/llm';

const VALID_DOT = `digraph test_pipeline {
  goal = "Test something"

  start [shape=Mdiamond, label="Start"]
  do_thing [shape=box, label="Do Thing", prompt="Do the thing"]
  done [shape=Msquare, label="Done"]

  start -> do_thing -> done
}`;

const INVALID_DOT_MISSING_START = `digraph bad {
  goal = "Bad pipeline"
  do_thing [shape=box, prompt="Do the thing"]
  done [shape=Msquare, label="Done"]
  do_thing -> done
}`;

function mockClient(responses: string[]): Client {
  let callIndex = 0;
  return {
    complete: vi.fn(async () => {
      const text = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return { text, finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 0 } };
    }),
    stream: vi.fn(),
  } as unknown as Client;
}

describe('generateDot', () => {
  it('generates valid DOT from a description', async () => {
    const client = mockClient([VALID_DOT]);

    const result = await generateDot({
      description: 'Run a test',
      client,
    });

    expect(result.dot).toBe(VALID_DOT);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(client.complete).toHaveBeenCalledOnce();
  });

  it('strips markdown fences from output', async () => {
    const fenced = '```dot\n' + VALID_DOT + '\n```';
    const client = mockClient([fenced]);

    const result = await generateDot({
      description: 'Run a test',
      client,
    });

    expect(result.dot).toBe(VALID_DOT);
  });

  it('retries once on validation error', async () => {
    const client = mockClient([INVALID_DOT_MISSING_START, VALID_DOT]);

    const result = await generateDot({
      description: 'Run a test',
      client,
    });

    expect(result.dot).toBe(VALID_DOT);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(client.complete).toHaveBeenCalledTimes(2);
  });

  it('returns diagnostics when retry also fails', async () => {
    const client = mockClient([INVALID_DOT_MISSING_START, INVALID_DOT_MISSING_START]);

    const result = await generateDot({
      description: 'Run a test',
      client,
    });

    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('skips validation when validateOutput is false', async () => {
    const client = mockClient([INVALID_DOT_MISSING_START]);

    const result = await generateDot({
      description: 'Run a test',
      client,
      validateOutput: false,
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(client.complete).toHaveBeenCalledOnce();
  });

  it('uses provided model', async () => {
    const client = mockClient([VALID_DOT]);

    await generateDot({
      description: 'Run a test',
      client,
      model: 'gpt-4o',
    });

    const callArgs = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-4o');
  });
});
