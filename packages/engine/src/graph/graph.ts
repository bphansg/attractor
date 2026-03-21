import type { GraphNode } from './node.js';
import type { GraphEdge } from './edge.js';

export class Graph {
  readonly id: string;
  readonly nodes: Map<string, GraphNode>;
  readonly edges: GraphEdge[];
  readonly attrs: Record<string, string>;

  // Graph-level attributes
  readonly goal: string;
  readonly label: string;
  readonly modelStylesheet: string;
  readonly defaultMaxRetries: number;
  readonly retryTarget: string;
  readonly fallbackRetryTarget: string;
  readonly defaultFidelity: string;

  constructor(opts: {
    id: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    attrs?: Record<string, string>;
    goal?: string;
    label?: string;
    modelStylesheet?: string;
    defaultMaxRetries?: number;
    retryTarget?: string;
    fallbackRetryTarget?: string;
    defaultFidelity?: string;
  }) {
    this.id = opts.id;
    this.nodes = new Map(opts.nodes.map((n) => [n.id, n]));
    this.edges = opts.edges;
    this.attrs = opts.attrs ?? {};
    this.goal = opts.goal ?? '';
    this.label = opts.label ?? '';
    this.modelStylesheet = opts.modelStylesheet ?? '';
    this.defaultMaxRetries = opts.defaultMaxRetries ?? 0;
    this.retryTarget = opts.retryTarget ?? '';
    this.fallbackRetryTarget = opts.fallbackRetryTarget ?? '';
    this.defaultFidelity = opts.defaultFidelity ?? '';
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  outgoingEdges(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.from === nodeId);
  }

  incomingEdges(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.to === nodeId);
  }

  /** Alias kept for backward compatibility */
  getOutgoingEdges(nodeId: string): GraphEdge[] {
    return this.outgoingEdges(nodeId);
  }

  /** Alias kept for backward compatibility */
  getIncomingEdges(nodeId: string): GraphEdge[] {
    return this.incomingEdges(nodeId);
  }

  getNodeList(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Find the start node (shape=Mdiamond or nodeType=start).
   */
  findStartNode(): GraphNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.nodeType === 'start' || node.shape === 'Mdiamond') {
        return node;
      }
    }
    return undefined;
  }

  /**
   * Find the exit node (shape=Msquare or nodeType=exit).
   */
  findExitNode(): GraphNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.nodeType === 'exit' || node.shape === 'Msquare') {
        return node;
      }
    }
    return undefined;
  }
}
