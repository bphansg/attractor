import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';
import { createOutcome } from '../state/outcome.js';
import type { Handler } from './interface.js';

export class ExitHandler implements Handler {
  async execute(_node: GraphNode, _context: Context, _graph: Graph, _logsRoot: string): Promise<Outcome> {
    return createOutcome({ status: 'success' });
  }
}
