import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Context } from './context.js';

export interface Checkpoint {
  timestamp: string;
  currentNode: string;
  completedNodes: string[];
  nodeRetries: Record<string, number>;
  contextValues: Record<string, unknown>;
  logs: string[];
}

export function createCheckpoint(
  context: Context,
  currentNode: string,
  completedNodes: string[],
  nodeRetries: Record<string, number>,
): Checkpoint {
  return {
    timestamp: new Date().toISOString(),
    currentNode,
    completedNodes: [...completedNodes],
    nodeRetries: { ...nodeRetries },
    contextValues: context.snapshot(),
    logs: context.getLogs(),
  };
}

export async function saveCheckpoint(checkpoint: Checkpoint, logsRoot: string): Promise<void> {
  await mkdir(logsRoot, { recursive: true });
  const filePath = join(logsRoot, 'checkpoint.json');
  await writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

export async function loadCheckpoint(logsRoot: string): Promise<Checkpoint | null> {
  const filePath = join(logsRoot, 'checkpoint.json');
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}
