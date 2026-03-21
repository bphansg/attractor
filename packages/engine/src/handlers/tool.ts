import { exec } from 'node:child_process';
import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';
import { createOutcome } from '../state/outcome.js';
import type { Handler } from './interface.js';

const DEFAULT_TIMEOUT_MS = 60_000;

export class ToolHandler implements Handler {
  async execute(node: GraphNode, _context: Context, _graph: Graph, _logsRoot: string): Promise<Outcome> {
    // 1. Get tool_command from node.attrs
    const command = node.attrs['tool_command'];

    if (!command || command.trim() === '') {
      return createOutcome({
        status: 'fail',
        failureReason: 'No tool_command specified in node attributes',
      });
    }

    // 2. Get timeout
    const rawTimeout = node.attrs['tool_timeout'];
    const timeoutMs = rawTimeout ? parseInt(rawTimeout, 10) : DEFAULT_TIMEOUT_MS;

    // 3. Execute shell command
    try {
      const output = await execCommand(command, timeoutMs);
      return createOutcome({
        status: 'success',
        notes: `Command exited successfully`,
        contextUpdates: {
          'tool.output': output,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return createOutcome({
        status: 'fail',
        failureReason: `Command failed: ${message}`,
      });
    }
  }
}

function execCommand(command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const combined = [stdout, stderr].filter(Boolean).join('\n');
        reject(new Error(combined || error.message));
        return;
      }
      resolve(stdout + (stderr ? '\n' + stderr : ''));
    });
  });
}
