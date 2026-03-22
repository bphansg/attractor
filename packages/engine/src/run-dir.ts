import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Sanitize a name to prevent path traversal. Only allows alphanumeric, underscore, hyphen, and dot. */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

/** Verify that a resolved path is contained within the expected base directory. */
function assertContainedIn(resolvedPath: string, baseDir: string): void {
  const normalizedBase = resolve(baseDir);
  const normalizedPath = resolve(resolvedPath);
  if (!normalizedPath.startsWith(normalizedBase + '/') && normalizedPath !== normalizedBase) {
    throw new Error(`Path traversal detected: ${resolvedPath} is outside ${baseDir}`);
  }
}

/**
 * Ensure the top-level run directory exists.
 */
export async function ensureRunDirectory(logsRoot: string): Promise<void> {
  await mkdir(logsRoot, { recursive: true });
}

/**
 * Create a stage sub-directory under the run directory.
 * Returns the absolute path of the created directory.
 */
export async function ensureStageDirectory(
  logsRoot: string,
  nodeId: string,
): Promise<string> {
  const safeId = sanitizeName(nodeId);
  const stageDir = join(logsRoot, safeId);
  assertContainedIn(stageDir, logsRoot);
  await mkdir(stageDir, { recursive: true });
  return stageDir;
}

/**
 * Write a file into a stage directory.
 */
export async function writeStageFile(
  stageDir: string,
  filename: string,
  content: string,
): Promise<void> {
  const safeFilename = sanitizeName(filename);
  const filePath = join(stageDir, safeFilename);
  assertContainedIn(filePath, stageDir);
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Write a manifest.json at the root of the run directory.
 */
export async function writeManifest(
  logsRoot: string,
  manifest: { name: string; goal: string; startTime: string },
): Promise<void> {
  await writeFile(
    join(logsRoot, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  );
}
