import type { Graph } from '../graph/graph.js';
import type { GraphNode } from '../graph/node.js';
import type { StyleRule, StyleDeclaration } from './types.js';

/**
 * Apply stylesheet rules to all nodes in the graph.
 *
 * For each node, matching rules are collected and sorted by specificity
 * (ascending). Among rules of equal specificity, later rules override earlier
 * ones.  A declaration is only applied when the node does not already have an
 * explicitly set value for that property.
 */
export function applyStylesheet(graph: Graph, rules: StyleRule[]): void {
  for (const node of graph.nodes.values()) {
    const matching = rules
      .filter((rule) => selectorMatches(rule, node))
      .sort((a, b) => a.selector.specificity - b.selector.specificity);

    // Build a merged declaration map: higher specificity and later position wins
    const merged = new Map<StyleDeclaration['property'], string>();
    for (const rule of matching) {
      for (const decl of rule.declarations) {
        merged.set(decl.property, decl.value);
      }
    }

    // Apply only where the node has no explicit value
    for (const [property, value] of merged) {
      applyDeclaration(node, property, value);
    }
  }
}

function selectorMatches(rule: StyleRule, node: GraphNode): boolean {
  const { type, value } = rule.selector;

  switch (type) {
    case 'universal':
      return true;
    case 'shape':
      return node.shape === value;
    case 'class': {
      const classes = node.className
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      return classes.includes(value);
    }
    case 'id':
      return node.id === value;
    default:
      return false;
  }
}

function applyDeclaration(
  node: GraphNode,
  property: StyleDeclaration['property'],
  value: string,
): void {
  switch (property) {
    case 'llm_model':
      if (!node.llmModel) {
        node.llmModel = value;
      }
      break;
    case 'llm_provider':
      if (!node.llmProvider) {
        node.llmProvider = value;
      }
      break;
    case 'reasoning_effort':
      if (!node.reasoningEffort) {
        node.reasoningEffort = value;
      }
      break;
  }
}
