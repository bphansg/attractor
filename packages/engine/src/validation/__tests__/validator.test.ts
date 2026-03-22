import { describe, it, expect } from 'vitest';
import { parseDot } from '../../parser/index.js';
import { buildGraph } from '../../graph/builder.js';
import { validate } from '../validator.js';
import { Graph } from '../../graph/graph.js';
import { createNode } from '../../graph/node.js';
import { createEdge } from '../../graph/edge.js';

describe('validate', () => {
  it('returns no errors for a valid pipeline', () => {
    const ast = parseDot(`digraph valid {
      goal = "Test validation"
      start [shape=Mdiamond]
      work [prompt="Do work"]
      done [shape=Msquare]
      start -> work -> done
    }`);
    const graph = buildGraph(ast);
    const diagnostics = validate(graph);

    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('produces an error when start node is missing', () => {
    const ast = parseDot(`digraph no_start {
      work [prompt="Do work"]
      done [shape=Msquare]
      work -> done
    }`);
    const graph = buildGraph(ast);
    const diagnostics = validate(graph);

    const startErrors = diagnostics.filter(
      (d) => d.severity === 'error' && d.message.toLowerCase().includes('start'),
    );
    expect(startErrors.length).toBeGreaterThanOrEqual(1);
  });

  it('produces an error when exit node is missing', () => {
    const ast = parseDot(`digraph no_exit {
      start [shape=Mdiamond]
      work [prompt="Do work"]
      start -> work
    }`);
    const graph = buildGraph(ast);
    const diagnostics = validate(graph);

    const exitErrors = diagnostics.filter(
      (d) =>
        d.severity === 'error' &&
        (d.message.toLowerCase().includes('exit') ||
          d.message.toLowerCase().includes('terminal')),
    );
    expect(exitErrors.length).toBeGreaterThanOrEqual(1);
  });

  it('produces a warning or error for unreachable nodes', () => {
    const ast = parseDot(`digraph unreachable {
      start [shape=Mdiamond]
      work [prompt="Do work"]
      orphan [prompt="I am alone"]
      done [shape=Msquare]
      start -> work -> done
    }`);
    const graph = buildGraph(ast);
    const diagnostics = validate(graph);

    const reachabilityIssues = diagnostics.filter(
      (d) =>
        d.message.toLowerCase().includes('unreachable') ||
        d.message.toLowerCase().includes('reachable'),
    );
    expect(reachabilityIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('produces an error when an edge targets a non-existent node', () => {
    // The builder auto-creates nodes referenced in edges, so to test
    // edge-target validation we construct the graph object directly.
    const graph = new Graph({
      id: 'bad_edge',
      nodes: [
        createNode({ id: 'start', shape: 'Mdiamond', nodeType: 'start' }),
        createNode({ id: 'done', shape: 'Msquare', nodeType: 'exit' }),
      ],
      edges: [
        createEdge('start', 'ghost'),
        createEdge('start', 'done'),
      ],
    });

    const diagnostics = validate(graph);
    const targetErrors = diagnostics.filter(
      (d) =>
        d.severity === 'error' &&
        (d.message.toLowerCase().includes('target') ||
          d.message.toLowerCase().includes('exist') ||
          d.message.toLowerCase().includes('ghost')),
    );
    expect(targetErrors.length).toBeGreaterThanOrEqual(1);
  });

  it('produces a warning for LLM node without prompt or label', () => {
    // The rule triggers when both prompt and label are empty.
    // The builder defaults label to node id, so we construct directly.
    const graph = new Graph({
      id: 'no_prompt',
      nodes: [
        createNode({ id: 'start', shape: 'Mdiamond', nodeType: 'start' }),
        createNode({ id: 'worker', shape: 'box', nodeType: 'codergen', label: '', prompt: '' }),
        createNode({ id: 'done', shape: 'Msquare', nodeType: 'exit' }),
      ],
      edges: [
        createEdge('start', 'worker'),
        createEdge('worker', 'done'),
      ],
    });
    const diagnostics = validate(graph);

    const promptWarnings = diagnostics.filter(
      (d) => d.message.toLowerCase().includes('prompt'),
    );
    expect(promptWarnings.length).toBeGreaterThanOrEqual(1);
  });
});
