import type { Graph } from '../graph/graph.js';
import type { Transform } from './interface.js';

/**
 * Expand `$goal` placeholders in node prompt attributes to the graph's goal string.
 */
export class VariableExpansionTransform implements Transform {
  apply(graph: Graph): Graph {
    for (const node of graph.nodes.values()) {
      if (node.prompt) {
        node.prompt = node.prompt.replace(/\$goal/g, graph.goal);
      }
    }
    return graph;
  }
}
