/**
 * @attractor/agent — Glob Tool
 *
 * Finds files matching a glob pattern, sorted by modification time.
 */

import type { RegisteredTool } from '../registry.js';

export const globTool: RegisteredTool = {
  definition: {
    name: 'glob',
    description:
      'Find files matching a glob pattern. Returns file paths sorted by modification time (most recent first).',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match (e.g. "**/*.ts")' },
        path: {
          type: 'string',
          description: 'Base directory to search from (defaults to working directory)',
        },
      },
      required: ['pattern'],
    },
  },
  executor: async (args, env) => {
    const pattern = args.pattern as string;
    const basePath = (args.path as string) ?? env.workingDirectory();

    const files = await env.glob(pattern, basePath);
    if (files.length === 0) {
      return 'No files found.';
    }
    return files.join('\n');
  },
};
