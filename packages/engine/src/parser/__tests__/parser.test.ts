import { describe, it, expect } from 'vitest';
import { parseDot } from '../index.js';
import { ParseError } from '../errors.js';

describe('parseDot', () => {
  it('parses a minimal digraph with start and done nodes', () => {
    const source = `digraph g {
      start [shape=Mdiamond]
      done [shape=Msquare]
      start -> done
    }`;
    const ast = parseDot(source);

    expect(ast.type).toBe('graph');
    expect(ast.id).toBe('g');
    expect(ast.statements.length).toBeGreaterThanOrEqual(3);

    const nodeStmts = ast.statements.filter((s) => s.type === 'node');
    expect(nodeStmts).toHaveLength(2);

    const startNode = nodeStmts.find((s) => s.type === 'node' && s.id === 'start');
    expect(startNode).toBeDefined();
    if (startNode?.type === 'node') {
      expect(startNode.attrs).toContainEqual({ key: 'shape', value: 'Mdiamond' });
    }

    const doneNode = nodeStmts.find((s) => s.type === 'node' && s.id === 'done');
    expect(doneNode).toBeDefined();
    if (doneNode?.type === 'node') {
      expect(doneNode.attrs).toContainEqual({ key: 'shape', value: 'Msquare' });
    }

    const edgeStmts = ast.statements.filter((s) => s.type === 'edge');
    expect(edgeStmts).toHaveLength(1);
    if (edgeStmts[0].type === 'edge') {
      expect(edgeStmts[0].nodes).toEqual(['start', 'done']);
    }
  });

  it('parses a graph-level goal attribute', () => {
    const source = `digraph pipeline {
      goal = "Build a web app"
      start [shape=Mdiamond]
      done [shape=Msquare]
      start -> done
    }`;
    const ast = parseDot(source);

    const attrDecl = ast.statements.find(
      (s) => s.type === 'attr_decl' && s.key === 'goal',
    );
    expect(attrDecl).toBeDefined();
    if (attrDecl?.type === 'attr_decl') {
      expect(attrDecl.value).toBe('Build a web app');
    }
  });

  it('parses a node with a prompt attribute', () => {
    const source = `digraph g {
      start [shape=Mdiamond]
      worker [prompt="Implement the feature"]
      done [shape=Msquare]
      start -> worker -> done
    }`;
    const ast = parseDot(source);

    const workerNode = ast.statements.find(
      (s) => s.type === 'node' && s.id === 'worker',
    );
    expect(workerNode).toBeDefined();
    if (workerNode?.type === 'node') {
      expect(workerNode.attrs).toContainEqual({
        key: 'prompt',
        value: 'Implement the feature',
      });
    }
  });

  it('parses chained edges a -> b -> c into a single edge statement', () => {
    const source = `digraph g {
      a -> b -> c
    }`;
    const ast = parseDot(source);

    const edgeStmts = ast.statements.filter((s) => s.type === 'edge');
    expect(edgeStmts).toHaveLength(1);
    if (edgeStmts[0].type === 'edge') {
      expect(edgeStmts[0].nodes).toEqual(['a', 'b', 'c']);
    }
  });

  it('parses an edge with label and condition attributes', () => {
    const source = `digraph g {
      gate -> done [label="pass", condition="outcome=success"]
    }`;
    const ast = parseDot(source);

    const edgeStmt = ast.statements.find((s) => s.type === 'edge');
    expect(edgeStmt).toBeDefined();
    if (edgeStmt?.type === 'edge') {
      expect(edgeStmt.attrs).toContainEqual({ key: 'label', value: 'pass' });
      expect(edgeStmt.attrs).toContainEqual({
        key: 'condition',
        value: 'outcome=success',
      });
    }
  });

  it('throws ParseError on invalid syntax (missing closing brace)', () => {
    const source = `digraph broken {
      start [shape=Mdiamond]
    `;
    expect(() => parseDot(source)).toThrow(ParseError);
  });

  it('parses a graph with a subgraph', () => {
    const source = `digraph g {
      start [shape=Mdiamond]
      subgraph cluster_phase1 {
        label = "Phase 1"
        step1 [prompt="Do step 1"]
      }
      done [shape=Msquare]
      start -> step1 -> done
    }`;
    const ast = parseDot(source);

    const subgraph = ast.statements.find((s) => s.type === 'subgraph');
    expect(subgraph).toBeDefined();
    if (subgraph?.type === 'subgraph') {
      expect(subgraph.id).toBe('cluster_phase1');
      expect(subgraph.statements.length).toBeGreaterThanOrEqual(1);

      const labelDecl = subgraph.statements.find(
        (s) => s.type === 'attr_decl' && s.key === 'label',
      );
      expect(labelDecl).toBeDefined();
      if (labelDecl?.type === 'attr_decl') {
        expect(labelDecl.value).toBe('Phase 1');
      }
    }
  });
});
