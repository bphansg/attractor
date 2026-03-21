/**
 * @attractor/agent — OpenAI v4a Patch Format Parser & Applier
 *
 * Implements the "*** Begin Patch" / "*** End Patch" format used by
 * OpenAI's code editing models. Supports Add, Delete, and Update
 * operations with context-based hunk matching.
 */

import type { RegisteredTool } from '../registry.js';
import type { ExecutionEnvironment } from '../../env/interface.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddFile {
  type: 'add';
  path: string;
  content: string;
}

interface DeleteFile {
  type: 'delete';
  path: string;
}

interface UpdateFile {
  type: 'update';
  path: string;
  moveTo?: string;
  hunks: Hunk[];
}

interface Hunk {
  contextBefore: string[];
  deletions: string[];
  additions: string[];
  contextAfter: string[];
}

type PatchOperation = AddFile | DeleteFile | UpdateFile;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parsePatch(patchText: string): PatchOperation[] {
  const lines = patchText.split('\n');
  const operations: PatchOperation[] = [];

  let i = 0;

  // Skip to "*** Begin Patch"
  while (i < lines.length && lines[i].trim() !== '*** Begin Patch') {
    i++;
  }
  if (i >= lines.length) {
    throw new Error('Patch does not contain "*** Begin Patch" marker');
  }
  i++; // skip the marker

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '*** End Patch') {
      break;
    }

    if (line.startsWith('*** Add File: ')) {
      const path = line.slice('*** Add File: '.length).trim();
      i++;
      const contentLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('***')) {
        // Content lines in add blocks have a '+' prefix
        const contentLine = lines[i];
        if (contentLine.startsWith('+')) {
          contentLines.push(contentLine.slice(1));
        } else {
          contentLines.push(contentLine);
        }
        i++;
      }
      operations.push({
        type: 'add',
        path,
        content: contentLines.join('\n'),
      });
    } else if (line.startsWith('*** Delete File: ')) {
      const path = line.slice('*** Delete File: '.length).trim();
      operations.push({ type: 'delete', path });
      i++;
    } else if (line.startsWith('*** Update File: ')) {
      const path = line.slice('*** Update File: '.length).trim();
      i++;

      let moveTo: string | undefined;
      if (i < lines.length && lines[i].startsWith('*** Move to: ')) {
        moveTo = lines[i].slice('*** Move to: '.length).trim();
        i++;
      }

      const hunks: Hunk[] = [];
      while (i < lines.length && lines[i].startsWith('@@')) {
        i++; // skip @@ line
        const hunk = parseHunk(lines, i);
        hunks.push(hunk.hunk);
        i = hunk.nextIndex;
      }

      operations.push({ type: 'update', path, moveTo, hunks });
    } else {
      i++;
    }
  }

  return operations;
}

function parseHunk(
  lines: string[],
  startIdx: number,
): { hunk: Hunk; nextIndex: number } {
  const contextBefore: string[] = [];
  const deletions: string[] = [];
  const additions: string[] = [];
  const contextAfter: string[] = [];

  let i = startIdx;
  let seenChanges = false;

  while (i < lines.length) {
    const line = lines[i];

    // Stop at next hunk, next file operation, or end marker
    if (
      line.startsWith('@@') ||
      line.startsWith('***') 
    ) {
      break;
    }

    if (line.startsWith('-')) {
      seenChanges = true;
      deletions.push(line.slice(1));
      i++;
    } else if (line.startsWith('+')) {
      seenChanges = true;
      additions.push(line.slice(1));
      i++;
    } else if (line.startsWith(' ') || line === '') {
      // Context line (space prefix) or empty line
      const content = line.startsWith(' ') ? line.slice(1) : line;
      if (!seenChanges) {
        contextBefore.push(content);
      } else {
        contextAfter.push(content);
      }
      i++;
    } else {
      // Unknown line format — treat as end of hunk
      break;
    }
  }

  return {
    hunk: { contextBefore, deletions, additions, contextAfter },
    nextIndex: i,
  };
}

// ---------------------------------------------------------------------------
// Applier
// ---------------------------------------------------------------------------

function applyHunksToContent(content: string, hunks: Hunk[]): string {
  const lines = content.split('\n');

  // Apply hunks in reverse order so that earlier line numbers stay valid
  // But first we need to find positions for all hunks
  const positions: { hunk: Hunk; startLine: number }[] = [];

  for (const hunk of hunks) {
    const startLine = findHunkPosition(lines, hunk);
    if (startLine === -1) {
      throw new Error(
        `Could not find matching context for hunk. ` +
          `Context: ${JSON.stringify(hunk.contextBefore.slice(0, 3))}`,
      );
    }
    positions.push({ hunk, startLine });
  }

  // Sort by position descending so we can apply from bottom to top
  positions.sort((a, b) => b.startLine - a.startLine);

  for (const { hunk, startLine } of positions) {
    const totalOldLines =
      hunk.contextBefore.length + hunk.deletions.length + hunk.contextAfter.length;
    const newLines = [
      ...hunk.contextBefore,
      ...hunk.additions,
      ...hunk.contextAfter,
    ];

    lines.splice(startLine, totalOldLines, ...newLines);
  }

  return lines.join('\n');
}

function findHunkPosition(lines: string[], hunk: Hunk): number {
  // Build the sequence of old lines we expect to find
  const oldLines = [
    ...hunk.contextBefore,
    ...hunk.deletions,
    ...hunk.contextAfter,
  ];

  if (oldLines.length === 0) {
    // No context or deletions — append at end
    return lines.length;
  }

  // Slide through the file looking for a match
  const searchEnd = lines.length - oldLines.length + 1;
  for (let i = 0; i < searchEnd; i++) {
    let match = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (lines[i + j] !== oldLines[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }

  // Fuzzy fallback: try matching with trimmed whitespace
  for (let i = 0; i < searchEnd; i++) {
    let match = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (lines[i + j].trimEnd() !== oldLines[j].trimEnd()) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }

  return -1;
}

// ---------------------------------------------------------------------------
// High-level apply
// ---------------------------------------------------------------------------

export async function applyPatch(
  patchText: string,
  env: ExecutionEnvironment,
): Promise<string[]> {
  const operations = parsePatch(patchText);
  const modifiedFiles: string[] = [];

  for (const op of operations) {
    switch (op.type) {
      case 'add': {
        await env.writeFile(op.path, op.content);
        modifiedFiles.push(op.path);
        break;
      }

      case 'delete': {
        // Read file first to confirm it exists, then write empty + remove
        // We use execCommand for deletion since the interface has no delete method
        await env.execCommand(`rm -f ${escapeShellArg(op.path)}`, 5_000);
        modifiedFiles.push(op.path);
        break;
      }

      case 'update': {
        // Read the raw file (we need the actual content, not line-numbered)
        const numbered = await env.readFile(op.path);
        const content = stripLineNumbers(numbered);
        const updated = applyHunksToContent(content, op.hunks);

        const targetPath = op.moveTo ?? op.path;
        await env.writeFile(targetPath, updated);

        // If moved, delete the original
        if (op.moveTo && op.moveTo !== op.path) {
          await env.execCommand(`rm -f ${escapeShellArg(op.path)}`, 5_000);
        }

        modifiedFiles.push(targetPath);
        break;
      }
    }
  }

  return modifiedFiles;
}

function stripLineNumbers(numbered: string): string {
  return numbered
    .split('\n')
    .map((line) => {
      const tabIdx = line.indexOf('\t');
      return tabIdx !== -1 ? line.slice(tabIdx + 1) : line;
    })
    .join('\n');
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const applyPatchTool: RegisteredTool = {
  definition: {
    name: 'apply_patch',
    description:
      'Apply a patch in the OpenAI v4a format. The patch describes file additions, ' +
      'deletions, and updates with context-based hunks. Returns the list of modified files.',
    parameters: {
      type: 'object',
      properties: {
        patch: {
          type: 'string',
          description: 'The full patch text in v4a format (*** Begin Patch ... *** End Patch)',
        },
      },
      required: ['patch'],
    },
  },
  executor: async (args, env) => {
    const patchText = args.patch as string;
    try {
      const modified = await applyPatch(patchText, env);
      if (modified.length === 0) {
        return 'No files were modified.';
      }
      return `Successfully applied patch. Modified files:\n${modified.join('\n')}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error applying patch: ${message}`;
    }
  },
};
