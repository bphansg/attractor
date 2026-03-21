import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome, StageStatus } from '../state/outcome.js';
import { createOutcome } from '../state/outcome.js';
import type { Handler } from './interface.js';

interface ParallelResult {
  targetId: string;
  edgeLabel: string;
  status: StageStatus;
  notes: string;
  contextUpdates: Record<string, unknown>;
  score?: number;
}

const STATUS_RANK: Record<string, number> = {
  success: 0,
  partial_success: 1,
  retry: 2,
  fail: 3,
  skipped: 4,
};

export class FanInHandler implements Handler {
  async execute(node: GraphNode, context: Context, _graph: Graph, _logsRoot: string): Promise<Outcome> {
    // 1. Read parallel.results from context
    const rawResults = context.get('parallel.results');

    if (!rawResults || !Array.isArray(rawResults) || rawResults.length === 0) {
      return createOutcome({
        status: 'fail',
        failureReason: 'No parallel results found in context',
      });
    }

    const results = rawResults as ParallelResult[];

    // 3/4. Heuristic ranking: sort by status rank, then score (descending), then ID
    const sorted = [...results].sort((a, b) => {
      const rankA = STATUS_RANK[a.status] ?? 99;
      const rankB = STATUS_RANK[b.status] ?? 99;
      if (rankA !== rankB) return rankA - rankB;

      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      if (scoreA !== scoreB) return scoreB - scoreA;

      return a.targetId.localeCompare(b.targetId);
    });

    const best = sorted[0]!;

    // 5. Record winner
    context.set('parallel.fan_in.best_id', best.targetId);
    context.set('parallel.fan_in.best_outcome', best.status);

    // 6. Return SUCCESS
    return createOutcome({
      status: 'success',
      notes: `Fan-in selected "${best.targetId}" (status: ${best.status})`,
      contextUpdates: {
        'parallel.fan_in.best_id': best.targetId,
        'parallel.fan_in.best_outcome': best.status,
      },
    });
  }
}
