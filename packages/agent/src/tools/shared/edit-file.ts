/**
 * @attractor/agent — Edit File Tool
 *
 * Performs exact string replacement in a file. Supports a replace_all flag
 * to replace every occurrence; otherwise the old_string must be unique.
 */

import type { RegisteredTool } from '../registry.js';

export const editFileTool: RegisteredTool = {
  definition: {
    name: 'edit_file',
    description:
      'Perform exact string replacement in a file. The old_string must appear exactly in the file. ' +
      'When replace_all is false (default), old_string must be unique. ' +
      'Errors if old_string is not found or is ambiguous.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit' },
        old_string: { type: 'string', description: 'The exact text to find and replace' },
        new_string: { type: 'string', description: 'The replacement text' },
        replace_all: {
          type: 'boolean',
          description: 'Replace all occurrences (default: false)',
          default: false,
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  executor: async (args, env) => {
    const filePath = args.file_path as string;
    const oldString = args.old_string as string;
    const newString = args.new_string as string;
    const replaceAll = (args.replace_all as boolean) ?? false;

    if (oldString === newString) {
      return 'Error: old_string and new_string are identical. No changes made.';
    }

    // Read the current file content (raw, no line numbers).
    const raw = await env.readFile(filePath);
    // Strip line-number prefixes to get the actual file content.
    const lines = raw.split('\n');
    const content = lines
      .map((line) => {
        // Line-numbered format: "  1\tcontent" — strip the prefix up to the first tab.
        const tabIdx = line.indexOf('\t');
        return tabIdx !== -1 ? line.slice(tabIdx + 1) : line;
      })
      .join('\n');

    // Count occurrences
    let count = 0;
    let searchStart = 0;
    while (true) {
      const idx = content.indexOf(oldString, searchStart);
      if (idx === -1) break;
      count++;
      searchStart = idx + oldString.length;
    }

    if (count === 0) {
      return `Error: old_string not found in ${filePath}. No changes made.`;
    }

    if (!replaceAll && count > 1) {
      return (
        `Error: old_string found ${count} times in ${filePath}. ` +
        'Use replace_all=true to replace all occurrences, or provide a more unique string.'
      );
    }

    const updated = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    await env.writeFile(filePath, updated);

    const replacements = replaceAll ? count : 1;
    return `Successfully replaced ${replacements} occurrence${replacements > 1 ? 's' : ''} in ${filePath}`;
  },
};
