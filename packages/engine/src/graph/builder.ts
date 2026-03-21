import type {
  ASTGraph,
  ASTStatement,
  ASTAttr,
  ASTNodeStmt,
  ASTEdgeStmt,
  ASTAttrStmt,
  ASTSubgraph,
  ASTAttrDecl,
} from '../parser/ast.js';
import type { GraphNode } from './node.js';
import type { GraphEdge } from './edge.js';
import { createNode } from './node.js';
import { createEdge } from './edge.js';
import { Graph } from './graph.js';
import { parseDuration, parseBoolean } from '../parser/values.js';

/**
 * Shape -> handler type mapping.
 */
const SHAPE_TO_TYPE: Record<string, string> = {
  Mdiamond: 'start',
  Msquare: 'exit',
  box: 'codergen',
  hexagon: 'wait.human',
  diamond: 'conditional',
  component: 'parallel',
  tripleoctagon: 'parallel.fan_in',
  parallelogram: 'tool',
  house: 'stack.manager_loop',
};

interface BuilderState {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  nodeDefaults: Record<string, string>;
  edgeDefaults: Record<string, string>;
  graphAttrs: Record<string, string>;
}

/**
 * Build a Graph from an AST produced by the DOT parser.
 */
export function buildGraph(ast: ASTGraph): Graph {
  const state: BuilderState = {
    nodes: new Map(),
    edges: [],
    nodeDefaults: {},
    edgeDefaults: {},
    graphAttrs: {},
  };

  processStatements(ast.statements, state, null);

  // Resolve node types from shapes and apply node defaults
  for (const node of state.nodes.values()) {
    if (!node.nodeType && node.shape) {
      node.nodeType = SHAPE_TO_TYPE[node.shape] ?? node.shape;
    }
  }

  // Extract graph-level attributes
  const attrs = state.graphAttrs;

  return new Graph({
    id: ast.id,
    nodes: Array.from(state.nodes.values()),
    edges: state.edges,
    attrs,
    goal: attrs['goal'] ?? '',
    label: attrs['label'] ?? '',
    modelStylesheet: attrs['model_stylesheet'] ?? attrs['modelStylesheet'] ?? '',
    defaultMaxRetries: attrs['max_retries'] ? safeInt(attrs['max_retries']) : 0,
    retryTarget: attrs['retry_target'] ?? '',
    fallbackRetryTarget: attrs['fallback_retry_target'] ?? '',
    defaultFidelity: attrs['fidelity'] ?? '',
  });
}

function processStatements(
  statements: ASTStatement[],
  state: BuilderState,
  subgraphLabel: string | null,
): void {
  for (const stmt of statements) {
    switch (stmt.type) {
      case 'attr_stmt':
        processAttrStmt(stmt, state);
        break;
      case 'node':
        processNodeStmt(stmt, state, subgraphLabel);
        break;
      case 'edge':
        processEdgeStmt(stmt, state);
        break;
      case 'subgraph':
        processSubgraph(stmt, state);
        break;
      case 'attr_decl':
        processAttrDecl(stmt, state);
        break;
    }
  }
}

function processAttrStmt(stmt: ASTAttrStmt, state: BuilderState): void {
  const attrsMap = attrsToRecord(stmt.attrs);
  switch (stmt.target) {
    case 'graph':
      Object.assign(state.graphAttrs, attrsMap);
      break;
    case 'node':
      Object.assign(state.nodeDefaults, attrsMap);
      break;
    case 'edge':
      Object.assign(state.edgeDefaults, attrsMap);
      break;
  }
}

function processNodeStmt(
  stmt: ASTNodeStmt,
  state: BuilderState,
  subgraphLabel: string | null,
): void {
  const rawAttrs: Record<string, string> = {
    ...state.nodeDefaults,
    ...attrsToRecord(stmt.attrs),
  };

  const node = createNode({
    id: stmt.id,
    label: rawAttrs['label'] ?? stmt.id,
    shape: rawAttrs['shape'] ?? 'box',
    nodeType: rawAttrs['type'] ?? '',
    prompt: rawAttrs['prompt'] ?? '',
    maxRetries: rawAttrs['max_retries'] ? safeInt(rawAttrs['max_retries']) : 0,
    goalGate: rawAttrs['goal_gate'] ? safeBool(rawAttrs['goal_gate']) : false,
    retryTarget: rawAttrs['retry_target'] ?? '',
    fallbackRetryTarget: rawAttrs['fallback_retry_target'] ?? '',
    fidelity: rawAttrs['fidelity'] ?? '',
    threadId: rawAttrs['thread_id'] ?? rawAttrs['threadId'] ?? '',
    className: buildClassName(rawAttrs['class'] ?? '', subgraphLabel),
    timeout: rawAttrs['timeout'] ? safeDuration(rawAttrs['timeout']) : null,
    llmModel: rawAttrs['llm_model'] ?? rawAttrs['llmModel'] ?? '',
    llmProvider: rawAttrs['llm_provider'] ?? rawAttrs['llmProvider'] ?? '',
    reasoningEffort: rawAttrs['reasoning_effort'] ?? rawAttrs['reasoningEffort'] ?? '',
    autoStatus: rawAttrs['auto_status'] ? safeBool(rawAttrs['auto_status']) : false,
    allowPartial: rawAttrs['allow_partial'] ? safeBool(rawAttrs['allow_partial']) : false,
    attrs: rawAttrs,
  });

  state.nodes.set(node.id, node);
}

function processEdgeStmt(stmt: ASTEdgeStmt, state: BuilderState): void {
  const rawAttrs: Record<string, string> = {
    ...state.edgeDefaults,
    ...attrsToRecord(stmt.attrs),
  };

  // Expand chained edges: A->B->C => edges A->B and B->C, attrs on all
  for (let i = 0; i < stmt.nodes.length - 1; i++) {
    const from = stmt.nodes[i];
    const to = stmt.nodes[i + 1];

    // Ensure nodes exist (create minimal ones if not yet declared)
    ensureNode(from, state);
    ensureNode(to, state);

    const edge = createEdge(from, to, {
      label: rawAttrs['label'] ?? '',
      condition: rawAttrs['condition'] ?? '',
      weight: rawAttrs['weight'] ? safeFloat(rawAttrs['weight']) : 1,
      fidelity: rawAttrs['fidelity'] ?? '',
      threadId: rawAttrs['thread_id'] ?? rawAttrs['threadId'] ?? '',
      loopRestart: rawAttrs['loop_restart'] ? safeBool(rawAttrs['loop_restart']) : false,
      attrs: rawAttrs,
    });

    state.edges.push(edge);
  }
}

function processSubgraph(stmt: ASTSubgraph, state: BuilderState): void {
  // Derive class name from subgraph label or id
  // Subgraph IDs conventionally start with "cluster_"
  let subgraphLabel: string | null = null;

  // First, scan for a label attr_decl inside the subgraph
  for (const s of stmt.statements) {
    if (s.type === 'attr_decl' && s.key === 'label') {
      subgraphLabel = s.value;
      break;
    }
  }

  // Fall back to subgraph id
  if (!subgraphLabel && stmt.id) {
    subgraphLabel = stmt.id.replace(/^cluster_/, '');
  }

  processStatements(stmt.statements, state, subgraphLabel);
}

function processAttrDecl(stmt: ASTAttrDecl, state: BuilderState): void {
  state.graphAttrs[stmt.key] = stmt.value;
}

// --- Helpers ---

function attrsToRecord(attrs: ASTAttr[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const attr of attrs) {
    record[attr.key] = attr.value;
  }
  return record;
}

function ensureNode(id: string, state: BuilderState): void {
  if (!state.nodes.has(id)) {
    const rawAttrs = { ...state.nodeDefaults };
    state.nodes.set(
      id,
      createNode({
        id,
        label: rawAttrs['label'] ?? id,
        shape: rawAttrs['shape'] ?? 'box',
        attrs: rawAttrs,
      }),
    );
  }
}

function buildClassName(explicitClass: string, subgraphLabel: string | null): string {
  const parts: string[] = [];
  if (subgraphLabel) parts.push(subgraphLabel);
  if (explicitClass) parts.push(explicitClass);
  return parts.join(',');
}

function safeInt(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function safeFloat(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function safeBool(raw: string): boolean {
  const lower = raw.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

function safeDuration(raw: string): number {
  try {
    return parseDuration(raw);
  } catch {
    // Fall back to parsing as plain integer (ms)
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
}
