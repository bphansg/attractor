import type { Graph } from '../../graph/graph.js';
import type { Diagnostic } from '../diagnostic.js';
import type { LintRule } from '../rule-interface.js';

const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'start',
  'exit',
  'conditional',
  'codergen',
  'wait-human',
  'wait.human',
  'tool',
  'parallel',
  'fan-in',
  'parallel.fan_in',
  'manager-loop',
  'stack.manager_loop',
]);

const KNOWN_SHAPES: ReadonlySet<string> = new Set([
  'Mdiamond',
  'Msquare',
  'box',
  'diamond',
  'stadium',
  'rectangle',
  'hexagon',
  'parallelogram',
  'circle',
  'subroutine',
  'trapezoid',
  'cylinder',
]);

export class TypeKnownRule implements LintRule {
  readonly name = 'type-known';

  apply(graph: Graph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const node of graph.nodes.values()) {
      const typeRecognized = !node.nodeType || KNOWN_TYPES.has(node.nodeType);
      const shapeRecognized = !node.shape || KNOWN_SHAPES.has(node.shape);

      if (!typeRecognized) {
        diagnostics.push({
          rule: this.name,
          severity: 'warning',
          message: `Node "${node.id}" has unrecognized type "${node.nodeType}".`,
          nodeId: node.id,
          fix: `Use a known type: ${Array.from(KNOWN_TYPES).join(', ')}.`,
        });
      }

      if (!shapeRecognized) {
        diagnostics.push({
          rule: this.name,
          severity: 'warning',
          message: `Node "${node.id}" has unrecognized shape "${node.shape}".`,
          nodeId: node.id,
          fix: `Use a known shape: ${Array.from(KNOWN_SHAPES).join(', ')}.`,
        });
      }
    }

    return diagnostics;
  }
}
