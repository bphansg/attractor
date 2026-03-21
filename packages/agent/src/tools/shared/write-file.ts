/**
 * @attractor/agent — Write File Tool
 *
 * Writes content to a file, creating parent directories if needed.
 */

import type { RegisteredTool } from '../registry.js';

export const writeFileTool: RegisteredTool = {
  definition: {
    name: 'write_file',
    description:
      'Write content to a file on the filesystem. Creates parent directories if they do not exist. Returns confirmation with bytes written.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to write to' },
        content: { type: 'string', description: 'The full content to write' },
      },
      required: ['file_path', 'content'],
    },
  },
  executor: async (args, env) => {
    const filePath = args.file_path as string;
    const content = args.content as string;
    await env.writeFile(filePath, content);
    const bytes = Buffer.byteLength(content, 'utf-8');
    return `Successfully wrote ${bytes} bytes to ${filePath}`;
  },
};
