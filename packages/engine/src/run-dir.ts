import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  const stageDir = join(logsRoot, nodeId);
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
  await writeFile(join(stageDir, filename), content, 'utf-8');
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
