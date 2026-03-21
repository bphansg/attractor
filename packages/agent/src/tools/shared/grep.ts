/**
 * @attractor/agent — Grep Tool
 *
 * Searches for a regex pattern in files, returning matching lines with
 * file paths and line numbers.
 */

import type { RegisteredTool } from '../registry.js';

export const grepTool: RegisteredTool = {
  definition: {
    name: 'grep',
    description:
      'Search for a regex pattern in files. Returns matching lines with file paths and line numbers.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: {
          type: 'string',
          description: 'File or directory to search in (defaults to working directory)',
        },
        glob_filter: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g. "*.ts", "**/*.js")',
        },
        case_insensitive: {
          type: 'boolean',
          description: 'Enable case-insensitive matching (default: false)',
          default: false,
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of matching lines to return',
        },
      },
      required: ['pattern'],
    },
  },
  executor: async (args, env) => {
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) ?? env.workingDirectory();
    const options = {
      globFilter: args.glob_filter as string | undefined,
      caseInsensitive: (args.case_insensitive as boolean) ?? false,
      maxResults: args.max_results as number | undefined,
    };

    const result = await env.grep(pattern, searchPath, options);
    return result || 'No matches found.';
  },
};
