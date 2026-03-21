import type { Graph } from '../graph/graph.js';

export interface Transform {
  apply(graph: Graph): Graph;
}
