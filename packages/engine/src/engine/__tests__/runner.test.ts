import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDot } from '../../parser/index.js';
import { buildGraph } from '../../graph/builder.js';
import { validate } from '../../validation/validator.js';
import { run } from '../runner.js';
import type { PipelineEvent } from '../runner.js';
import { createDefaultRegistry } from '../../handlers/index.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'attractor-test-'));
}

describe('run', () => {
  it('completes a linear 3-node pipeline successfully', async () => {
    const ast = parseDot(`digraph linear {
      goal = "Test linear execution"
      start [shape=Mdiamond]
      step1 [prompt="Do step 1"]
      step2 [prompt="Do step 2"]
      done [shape=Msquare]
      start -> step1 -> step2 -> done
    }`);
    const graph = buildGraph(ast);

    // Validation should pass
    const diagnostics = validate(graph);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);

    const logsRoot = await makeTmpDir();
    const outcome = await run(graph, {
      logsRoot,
      handlerRegistry: createDefaultRegistry(),
    });

    expect(outcome.status).toBe('success');
  });

  it('follows the correct branch on a success outcome', async () => {
    const ast = parseDot(`digraph branch {
      goal = "Test branching"
      start [shape=Mdiamond]
      work [prompt="Do work"]
      gate [shape=diamond]
      done [shape=Msquare]
      start -> work -> gate
      gate -> done [label="pass", condition="outcome=success", weight=2]
      gate -> work [label="fail", condition="outcome!=success"]
    }`);
    const graph = buildGraph(ast);

    const logsRoot = await makeTmpDir();
    const outcome = await run(graph, {
      logsRoot,
      handlerRegistry: createDefaultRegistry(),
    });

    // The default handlers return success, so the pipeline should take
    // the gate -> done branch and complete successfully.
    expect(outcome.status).toBe('success');
  });

  it('emits pipeline:start and pipeline:end events', async () => {
    const ast = parseDot(`digraph events {
      start [shape=Mdiamond]
      done [shape=Msquare]
      start -> done
    }`);
    const graph = buildGraph(ast);

    const logsRoot = await makeTmpDir();
    const events: PipelineEvent[] = [];

    await run(graph, {
      logsRoot,
      handlerRegistry: createDefaultRegistry(),
      onEvent: (e) => events.push(e),
    });

    const types = events.map((e) => e.type);
    expect(types).toContain('pipeline:start');
    expect(types).toContain('pipeline:end');
  });

  it('emits node:enter and node:exit events for traversed nodes', async () => {
    const ast = parseDot(`digraph node_events {
      start [shape=Mdiamond]
      work [prompt="Do work"]
      done [shape=Msquare]
      start -> work -> done
    }`);
    const graph = buildGraph(ast);

    const logsRoot = await makeTmpDir();
    const events: PipelineEvent[] = [];

    await run(graph, {
      logsRoot,
      handlerRegistry: createDefaultRegistry(),
      onEvent: (e) => events.push(e),
    });

    const types = events.map((e) => e.type);
    expect(types).toContain('node:enter');
    expect(types).toContain('node:exit');
  });

  it('returns fail when graph has no start node', async () => {
    const { Graph } = await import('../../graph/graph.js');
    const { createNode } = await import('../../graph/node.js');

    const graph = new Graph({
      id: 'no_start',
      nodes: [createNode({ id: 'done', shape: 'Msquare', nodeType: 'exit' })],
      edges: [],
    });

    const logsRoot = await makeTmpDir();
    const outcome = await run(graph, {
      logsRoot,
      handlerRegistry: createDefaultRegistry(),
    });

    expect(outcome.status).toBe('fail');
    expect(outcome.failureReason).toContain('start');
  });
});
