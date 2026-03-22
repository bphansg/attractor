import { describe, it, expect } from 'vitest';
import { parseDot } from '../../parser/index.js';
import { buildGraph } from '../builder.js';

describe('buildGraph', () => {
  it('builds a graph from a simple pipeline with nodes and edges', () => {
    const ast = parseDot(`digraph simple {
      start [shape=Mdiamond]
      work [prompt="Do work"]
      done [shape=Msquare]
      start -> work -> done
    }`);
    const graph = buildGraph(ast);

    expect(graph.id).toBe('simple');
    expect(graph.nodes.size).toBe(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.getNode('start')).toBeDefined();
    expect(graph.getNode('work')).toBeDefined();
    expect(graph.getNode('done')).toBeDefined();
  });

  it('maps Mdiamond shape to start nodeType', () => {
    const ast = parseDot(`digraph g {
      begin [shape=Mdiamond]
      end [shape=Msquare]
      begin -> end
    }`);
    const graph = buildGraph(ast);
    expect(graph.getNode('begin')?.nodeType).toBe('start');
  });

  it('maps Msquare shape to exit nodeType', () => {
    const ast = parseDot(`digraph g {
      begin [shape=Mdiamond]
      end [shape=Msquare]
      begin -> end
    }`);
    const graph = buildGraph(ast);
    expect(graph.getNode('end')?.nodeType).toBe('exit');
  });

  it('maps default shape (box) to codergen nodeType', () => {
    const ast = parseDot(`digraph g {
      start [shape=Mdiamond]
      worker [prompt="Do stuff"]
      done [shape=Msquare]
      start -> worker -> done
    }`);
    const graph = buildGraph(ast);
    expect(graph.getNode('worker')?.nodeType).toBe('codergen');
  });

  it('maps diamond shape to conditional nodeType', () => {
    const ast = parseDot(`digraph g {
      gate [shape=diamond]
    }`);
    const graph = buildGraph(ast);
    expect(graph.getNode('gate')?.nodeType).toBe('conditional');
  });

  it('maps hexagon shape to wait.human nodeType', () => {
    const ast = parseDot(`digraph g {
      review [shape=hexagon]
    }`);
    const graph = buildGraph(ast);
    expect(graph.getNode('review')?.nodeType).toBe('wait.human');
  });

  it('extracts goal from graph attributes', () => {
    const ast = parseDot(`digraph g {
      goal = "Build something great"
      start [shape=Mdiamond]
      done [shape=Msquare]
      start -> done
    }`);
    const graph = buildGraph(ast);
    expect(graph.goal).toBe('Build something great');
  });

  it('produces two edges for chained edges a -> b -> c', () => {
    const ast = parseDot(`digraph g {
      a -> b -> c
    }`);
    const graph = buildGraph(ast);

    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0].from).toBe('a');
    expect(graph.edges[0].to).toBe('b');
    expect(graph.edges[1].from).toBe('b');
    expect(graph.edges[1].to).toBe('c');
  });
});
