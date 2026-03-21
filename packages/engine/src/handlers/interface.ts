import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';

export interface Handler {
  execute(node: GraphNode, context: Context, graph: Graph, logsRoot: string): Promise<Outcome>;
}

const SHAPE_TO_TYPE: Record<string, string> = {
  stadium: 'start',
  diamond: 'conditional',
  rectangle: 'codergen',
  hexagon: 'wait-human',
  parallelogram: 'tool',
  circle: 'exit',
  subroutine: 'manager-loop',
  trapezoid: 'parallel',
  cylinder: 'fan-in',
};

export class HandlerRegistry {
  private handlers: Map<string, Handler> = new Map();

  register(type: string, handler: Handler): void {
    this.handlers.set(type, handler);
  }

  get(type: string): Handler | undefined {
    return this.handlers.get(type);
  }

  resolve(node: GraphNode): Handler {
    // First try explicit nodeType
    if (node.nodeType) {
      const handler = this.handlers.get(node.nodeType);
      if (handler) return handler;
    }

    // Fall back to shape mapping
    const mappedType = SHAPE_TO_TYPE[node.shape];
    if (mappedType) {
      const handler = this.handlers.get(mappedType);
      if (handler) return handler;
    }

    throw new Error(
      `No handler found for node "${node.id}" (nodeType="${node.nodeType}", shape="${node.shape}")`,
    );
  }
}
