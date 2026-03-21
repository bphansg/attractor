import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';
import { createOutcome } from '../state/outcome.js';
import type { Handler } from './interface.js';

const DEFAULT_POLL_INTERVAL_MS = 45_000;
const DEFAULT_MAX_CYCLES = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ManagerLoopHandler implements Handler {
  async execute(node: GraphNode, context: Context, graph: Graph, _logsRoot: string): Promise<Outcome> {
    // 1. Get child dotfile from graph attrs
    const childDotfile =
      node.attrs['stack.child_dotfile'] ??
      graph.attrs['stack.child_dotfile'] ??
      '';

    // 2. Parse config
    const rawPollInterval = node.attrs['poll_interval'];
    const pollIntervalMs = rawPollInterval
      ? parseInt(rawPollInterval, 10) * 1000
      : DEFAULT_POLL_INTERVAL_MS;

    const rawMaxCycles = node.attrs['max_cycles'];
    const maxCycles = rawMaxCycles ? parseInt(rawMaxCycles, 10) : DEFAULT_MAX_CYCLES;

    const stopCondition = node.attrs['stop_condition'] ?? '';
    const rawActions = node.attrs['actions'];
    const actions = rawActions ? rawActions.split(',').map((a) => a.trim()) : ['observe', 'wait'];

    // 3. Auto-start child if configured
    if (node.attrs['auto_start'] === 'true' && childDotfile) {
      context.set('manager.child_dotfile', childDotfile);
      context.set('manager.child_status', 'started');
    }

    // 4. Loop up to max_cycles
    for (let cycle = 0; cycle < maxCycles; cycle++) {
      context.set('manager.cycle', cycle);

      // Observe: check child status from context
      if (actions.includes('observe')) {
        const childStatus = context.getString('manager.child_status', 'unknown');

        // Check stop conditions
        if (childStatus === 'completed') {
          return createOutcome({
            status: 'success',
            notes: `Manager loop completed: child finished after ${cycle + 1} cycles`,
            contextUpdates: {
              'manager.cycles_completed': cycle + 1,
              'manager.exit_reason': 'child_completed',
            },
          });
        }

        if (childStatus === 'failed') {
          return createOutcome({
            status: 'fail',
            failureReason: `Child process failed after ${cycle + 1} cycles`,
            contextUpdates: {
              'manager.cycles_completed': cycle + 1,
              'manager.exit_reason': 'child_failed',
            },
          });
        }

        // Custom stop condition
        if (stopCondition && context.getBoolean(stopCondition)) {
          return createOutcome({
            status: 'success',
            notes: `Manager loop stopped: condition "${stopCondition}" met after ${cycle + 1} cycles`,
            contextUpdates: {
              'manager.cycles_completed': cycle + 1,
              'manager.exit_reason': 'stop_condition',
            },
          });
        }
      }

      // Wait: sleep poll_interval
      if (actions.includes('wait')) {
        await sleep(pollIntervalMs);
      }
    }

    // Max cycles reached
    return createOutcome({
      status: 'fail',
      failureReason: `Manager loop exceeded max_cycles (${maxCycles})`,
      contextUpdates: {
        'manager.cycles_completed': maxCycles,
        'manager.exit_reason': 'max_cycles_exceeded',
      },
    });
  }
}
