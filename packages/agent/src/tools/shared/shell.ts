/**
 * @attractor/agent — Shell Tool
 *
 * Executes shell commands via the execution environment. Supports a
 * configurable timeout and returns stdout, stderr, and exit code.
 */

import type { RegisteredTool } from '../registry.js';

const DEFAULT_TIMEOUT_MS = 120_000;

export const shellTool: RegisteredTool = {
  definition: {
    name: 'shell',
    description:
      'Execute a shell command. Returns stdout, stderr, and exit code. ' +
      'Commands are run via /bin/bash -c on macOS/Linux.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout_ms: {
          type: 'integer',
          description: `Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`,
          default: DEFAULT_TIMEOUT_MS,
        },
        working_dir: {
          type: 'string',
          description: 'Working directory for the command (defaults to session cwd)',
        },
      },
      required: ['command'],
    },
  },
  executor: async (args, env) => {
    const command = args.command as string;
    const timeoutMs = (args.timeout_ms as number) ?? DEFAULT_TIMEOUT_MS;
    const workingDir = args.working_dir as string | undefined;

    const result = await env.execCommand(command, timeoutMs, workingDir);

    if (result.timedOut) {
      return `Error: Command timed out after ${timeoutMs}ms.\n\nPartial stdout:\n${result.stdout}\n\nPartial stderr:\n${result.stderr}`;
    }

    const parts: string[] = [];
    if (result.stdout) {
      parts.push(result.stdout);
    }
    if (result.stderr) {
      parts.push(`[stderr]\n${result.stderr}`);
    }
    parts.push(`[exit code: ${result.exitCode}]`);

    return parts.join('\n');
  },
};
