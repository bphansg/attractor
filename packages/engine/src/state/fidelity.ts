import type { Context } from './context.js';

export type FidelityMode =
  | 'full'
  | 'truncate'
  | 'compact'
  | 'summary:low'
  | 'summary:medium'
  | 'summary:high';

const VALID_FIDELITY_MODES: ReadonlySet<string> = new Set([
  'full',
  'truncate',
  'compact',
  'summary:low',
  'summary:medium',
  'summary:high',
]);

const DEFAULT_FIDELITY: FidelityMode = 'full';

export function resolveFidelity(
  edgeFidelity: string | undefined,
  nodeFidelity: string | undefined,
  graphDefaultFidelity: string | undefined,
): FidelityMode {
  const raw = edgeFidelity ?? nodeFidelity ?? graphDefaultFidelity;
  if (raw && VALID_FIDELITY_MODES.has(raw)) {
    return raw as FidelityMode;
  }
  return DEFAULT_FIDELITY;
}

export function resolveThreadId(
  nodeThreadId: string | undefined,
  edgeThreadId: string | undefined,
  graphDefaultThread: string | undefined,
  subgraphClass: string | undefined,
  previousNodeId: string,
): string {
  if (nodeThreadId) {
    return nodeThreadId;
  }
  if (edgeThreadId) {
    return edgeThreadId;
  }
  if (subgraphClass) {
    return subgraphClass;
  }
  if (graphDefaultThread) {
    return graphDefaultThread;
  }
  return previousNodeId;
}

export function buildFidelityContext(
  mode: FidelityMode,
  context: Context,
  completedNodes: string[],
  nodeOutcomes: Record<string, { status: string; notes: string }>,
  graphGoal: string,
): string {
  switch (mode) {
    case 'full':
      return buildFullContext(context, completedNodes, nodeOutcomes, graphGoal);
    case 'truncate':
      return buildTruncateContext(context, completedNodes, nodeOutcomes, graphGoal);
    case 'compact':
      return buildCompactContext(context, completedNodes, nodeOutcomes, graphGoal);
    case 'summary:low':
      return buildSummaryContext('low', context, completedNodes, nodeOutcomes, graphGoal);
    case 'summary:medium':
      return buildSummaryContext('medium', context, completedNodes, nodeOutcomes, graphGoal);
    case 'summary:high':
      return buildSummaryContext('high', context, completedNodes, nodeOutcomes, graphGoal);
  }
}

function buildFullContext(
  context: Context,
  completedNodes: string[],
  nodeOutcomes: Record<string, { status: string; notes: string }>,
  graphGoal: string,
): string {
  const lines: string[] = [];
  lines.push(`Goal: ${graphGoal}`);
  lines.push('');
  lines.push('Completed nodes:');
  for (const nodeId of completedNodes) {
    const outcome = nodeOutcomes[nodeId];
    if (outcome) {
      lines.push(`  - ${nodeId}: ${outcome.status} — ${outcome.notes}`);
    } else {
      lines.push(`  - ${nodeId}`);
    }
  }
  lines.push('');
  lines.push('Context:');
  for (const [key, value] of context.entries()) {
    lines.push(`  ${key}: ${JSON.stringify(value)}`);
  }
  lines.push('');
  lines.push('Logs:');
  for (const log of context.getLogs()) {
    lines.push(`  ${log}`);
  }
  return lines.join('\n');
}

function buildTruncateContext(
  context: Context,
  completedNodes: string[],
  nodeOutcomes: Record<string, { status: string; notes: string }>,
  graphGoal: string,
): string {
  const lines: string[] = [];
  lines.push(`Goal: ${graphGoal}`);
  lines.push('');
  lines.push('Completed nodes:');
  for (const nodeId of completedNodes) {
    const outcome = nodeOutcomes[nodeId];
    if (outcome) {
      lines.push(`  - ${nodeId}: ${outcome.status} — ${truncate(outcome.notes, 200)}`);
    } else {
      lines.push(`  - ${nodeId}`);
    }
  }
  lines.push('');
  lines.push('Context:');
  for (const [key, value] of context.entries()) {
    lines.push(`  ${key}: ${truncate(JSON.stringify(value), 200)}`);
  }
  return lines.join('\n');
}

function buildCompactContext(
  context: Context,
  completedNodes: string[],
  nodeOutcomes: Record<string, { status: string; notes: string }>,
  graphGoal: string,
): string {
  const lines: string[] = [];
  lines.push(`Goal: ${graphGoal}`);
  lines.push('');
  lines.push(`Completed: ${completedNodes.join(', ')}`);
  lines.push('');
  lines.push('Outcomes:');
  for (const nodeId of completedNodes) {
    const outcome = nodeOutcomes[nodeId];
    if (outcome) {
      lines.push(`  ${nodeId}: ${outcome.status}`);
    }
  }
  lines.push('');
  lines.push('Context keys:');
  lines.push(`  ${context.keys().join(', ')}`);
  return lines.join('\n');
}

function buildSummaryContext(
  level: 'low' | 'medium' | 'high',
  _context: Context,
  completedNodes: string[],
  nodeOutcomes: Record<string, { status: string; notes: string }>,
  graphGoal: string,
): string {
  const lines: string[] = [];
  lines.push(`Goal: ${graphGoal}`);
  lines.push('');

  const total = completedNodes.length;
  const succeeded = completedNodes.filter(
    (n) => nodeOutcomes[n]?.status === 'success',
  ).length;
  const failed = completedNodes.filter(
    (n) => nodeOutcomes[n]?.status === 'fail',
  ).length;

  lines.push(`Progress: ${total} nodes completed (${succeeded} succeeded, ${failed} failed)`);

  if (level === 'medium' || level === 'high') {
    lines.push('');
    lines.push('Recent outcomes:');
    const recentCount = level === 'high' ? 3 : 5;
    const recent = completedNodes.slice(-recentCount);
    for (const nodeId of recent) {
      const outcome = nodeOutcomes[nodeId];
      if (outcome) {
        const notes = level === 'high' ? '' : ` — ${truncate(outcome.notes, 100)}`;
        lines.push(`  ${nodeId}: ${outcome.status}${notes}`);
      }
    }
  }

  return lines.join('\n');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
}
