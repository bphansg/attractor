/**
 * @attractor/agent — Read File Tool
 *
 * Reads a file from the filesystem, returning line-numbered content.
 */

import type { RegisteredTool } from '../registry.js';

export const readFileTool: RegisteredTool = {
  definition: {
    name: 'read_file',
    description: 'Read a file from the filesystem. Returns line-numbered content.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to read' },
        offset: { type: 'integer', description: '1-based line number to start from' },
        limit: { type: 'integer', description: 'Max lines to read (default: 2000)' },
      },
      required: ['file_path'],
    },
  },
  executor: async (args, env) => {
    const filePath = args.file_path as string;
    const offset = args.offset as number | undefined;
    const limit = args.limit as number | undefined;
    const content = await env.readFile(filePath, offset, limit);
    return content;
  },
};
