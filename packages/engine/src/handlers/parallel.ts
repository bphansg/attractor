import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';
import { createOutcome } from '../state/outcome.js';
import type { Handler } from './interface.js';

export type SubRunner = (
  node: GraphNode,
  context: Context,
  graph: Graph,
  logsRoot: string,
) => Promise<Outcome>;

interface BranchResult {
  edgeLabel: string;
  targetId: string;
  outcome: Outcome;
}

export class ParallelHandler implements Handler {
  private subRunner: SubRunner;

  constructor(subRunner: SubRunner) {
    this.subRunner = subRunner;
  }

  async execute(node: GraphNode, context: Context, graph: Graph, logsRoot: string): Promise<Outcome> {
    // 1. Get outgoing edges as branches
    const edges = graph.getOutgoingEdges(node.id);

    if (edges.length === 0) {
      return createOutcome({
        status: 'success',
        notes: 'No branches to execute',
      });
    }

    // 2. Read join_policy and max_parallel from attrs
    const joinPolicy = node.attrs['join_policy'] || 'wait_all';
    const rawMaxParallel = node.attrs['max_parallel'];
    const maxParallel = rawMaxParallel ? parseInt(rawMaxParallel, 10) : 4;

    // 3. Clone context for each branch and prepare execution
    const branches: Array<{ targetId: string; label: string; context: Context }> = [];
    for (const edge of edges) {
      const targetNode = graph.getNode(edge.to);
      if (!targetNode) continue;
      branches.push({
        targetId: edge.to,
        label: edge.label || edge.to,
        context: context.clone(),
      });
    }

    // 4. Execute branches concurrently (up to max_parallel)
    const results: BranchResult[] = [];

    for (let i = 0; i < branches.length; i += maxParallel) {
      const batch = branches.slice(i, i + maxParallel);
      const batchResults = await Promise.all(
        batch.map(async (branch) => {
          const targetNode = graph.getNode(branch.targetId);
          if (!targetNode) {
            return {
              edgeLabel: branch.label,
              targetId: branch.targetId,
              outcome: createOutcome({
                status: 'fail' as const,
                failureReason: `Target node "${branch.targetId}" not found`,
              }),
            };
          }
          const outcome = await this.subRunner(targetNode, branch.context, graph, logsRoot);
          return {
            edgeLabel: branch.label,
            targetId: branch.targetId,
            outcome,
          };
        }),
      );
      results.push(...batchResults);
    }

    // 5. Store results in context
    context.set(
      'parallel.results',
      results.map((r) => ({
        targetId: r.targetId,
        edgeLabel: r.edgeLabel,
        status: r.outcome.status,
        notes: r.outcome.notes,
        contextUpdates: r.outcome.contextUpdates,
      })),
    );

    // 6. Evaluate join policy
    const successes = results.filter((r) => r.outcome.status === 'success');
    const failures = results.filter((r) => r.outcome.status === 'fail');

    if (joinPolicy === 'first_success') {
      if (successes.length > 0) {
        return createOutcome({
          status: 'success',
          notes: `first_success: ${successes.length}/${results.length} succeeded`,
          contextUpdates: { 'parallel.results': context.get('parallel.results') },
        });
      }
      return createOutcome({
        status: 'fail',
        failureReason: `first_success: all ${results.length} branches failed`,
        contextUpdates: { 'parallel.results': context.get('parallel.results') },
      });
    }

    // Default: wait_all
    if (failures.length === 0) {
      return createOutcome({
        status: 'success',
        notes: `wait_all: all ${results.length} branches succeeded`,
        contextUpdates: { 'parallel.results': context.get('parallel.results') },
      });
    }

    return createOutcome({
      status: 'partial_success',
      notes: `wait_all: ${successes.length}/${results.length} succeeded, ${failures.length} failed`,
      contextUpdates: { 'parallel.results': context.get('parallel.results') },
    });
  }
}
