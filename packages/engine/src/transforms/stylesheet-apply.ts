import type { Graph } from '../graph/graph.js';
import { parseStylesheet } from '../stylesheet/parser.js';
import { applyStylesheet } from '../stylesheet/apply.js';
import type { Transform } from './interface.js';

/**
 * Apply the graph's model_stylesheet (if present) to all nodes.
 */
export class StylesheetApplyTransform implements Transform {
  apply(graph: Graph): Graph {
    if (!graph.modelStylesheet) {
      return graph;
    }
    const rules = parseStylesheet(graph.modelStylesheet);
    applyStylesheet(graph, rules);
    return graph;
  }
}
