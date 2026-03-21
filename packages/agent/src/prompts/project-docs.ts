/**
 * @attractor/agent — Project Documentation Discovery
 *
 * Walks from the working directory up to the git root, collecting
 * provider-relevant documentation files (AGENTS.md, CLAUDE.md, GEMINI.md,
 * .codex/instructions.md) and returning their contents within a total
 * budget of 32 KB.
 */

import type { ExecutionEnvironment } from '../env/interface.js';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum total characters across all discovered documentation. */
const DOC_BUDGET = 32 * 1024;

/** Truncation marker appended when a document is cut short. */
const TRUNCATION_MARKER = '\n\n--- DOCUMENT TRUNCATED ---\n';

// ---------------------------------------------------------------------------
// Profile-specific doc file names
// ---------------------------------------------------------------------------

const COMMON_DOCS = ['AGENTS.md'];

const PROFILE_DOCS: Record<string, string[]> = {
  anthropic: ['CLAUDE.md'],
  openai: ['.codex/instructions.md'],
  gemini: ['GEMINI.md'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the git root by walking up from `startDir`.  Returns the first
 * directory containing a `.git` entry, or `startDir` itself if none is
 * found.
 */
async function findGitRoot(
  env: ExecutionEnvironment,
  startDir: string,
): Promise<string> {
  let dir = startDir;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitExists = await env.fileExists(path.join(dir, '.git'));
    if (gitExists) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      // Reached filesystem root without finding .git
      return startDir;
    }
    dir = parent;
  }
}

/**
 * Collect unique directory paths from `startDir` up to and including
 * `rootDir`, ordered from `rootDir` (outermost) to `startDir` (innermost)
 * so that more general docs appear first.
 */
function directoryChain(startDir: string, rootDir: string): string[] {
  const dirs: string[] = [];
  let dir = startDir;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    dirs.push(dir);
    if (dir === rootDir) break;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Reverse so outermost (git root) comes first
  return dirs.reverse();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover and load project documentation files relevant to the given
 * provider profile.
 *
 * The function walks from the current working directory up to the git root,
 * loading AGENTS.md in every directory and provider-specific files (e.g.
 * CLAUDE.md for Anthropic) where they exist.
 *
 * The total content is capped at {@link DOC_BUDGET} characters.  If the
 * budget is exceeded, the last document is truncated and a marker is
 * appended.
 *
 * @returns An array of document contents, ordered outermost to innermost.
 */
export async function discoverProjectDocs(
  env: ExecutionEnvironment,
  profileId: string,
): Promise<string[]> {
  const cwd = env.workingDirectory();
  const gitRoot = await findGitRoot(env, cwd);
  const dirs = directoryChain(cwd, gitRoot);

  const docNames = [
    ...COMMON_DOCS,
    ...(PROFILE_DOCS[profileId] ?? []),
  ];

  const results: string[] = [];
  let totalLength = 0;

  for (const dir of dirs) {
    for (const docName of docNames) {
      const filePath = path.join(dir, docName);

      const exists = await env.fileExists(filePath);
      if (!exists) continue;

      let content: string;
      try {
        content = await env.readFile(filePath);
      } catch {
        continue;
      }

      if (content.trim().length === 0) continue;

      const header = `### ${path.relative(gitRoot, filePath) || docName}\n\n`;
      const fullEntry = header + content;

      const remaining = DOC_BUDGET - totalLength;
      if (remaining <= 0) break;

      if (fullEntry.length <= remaining) {
        results.push(fullEntry);
        totalLength += fullEntry.length;
      } else {
        // Truncate to fit within budget
        const truncated =
          fullEntry.slice(0, remaining - TRUNCATION_MARKER.length) +
          TRUNCATION_MARKER;
        results.push(truncated);
        totalLength += truncated.length;
        break;
      }
    }

    if (totalLength >= DOC_BUDGET) break;
  }

  return results;
}
