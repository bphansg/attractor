import type { Graph } from '../graph/graph.js';
import type { Diagnostic } from './diagnostic.js';

export interface LintRule {
  name: string;
  apply(graph: Graph): Diagnostic[];
}
