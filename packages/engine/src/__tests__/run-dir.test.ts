import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { ensureRunDirectory, ensureStageDirectory, writeStageFile } from '../run-dir.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'attractor-rundir-test-'));
}

describe('ensureRunDirectory', () => {
  it('creates the run directory', async () => {
    const base = await makeTmpDir();
    const runDir = join(base, 'run-001');
    await ensureRunDirectory(runDir);

    const stats = await stat(runDir);
    expect(stats.isDirectory()).toBe(true);
  });
});

describe('ensureStageDirectory', () => {
  it('creates a stage subdirectory for a normal nodeId', async () => {
    const logsRoot = await makeTmpDir();
    const stageDir = await ensureStageDirectory(logsRoot, 'step1');

    const stats = await stat(stageDir);
    expect(stats.isDirectory()).toBe(true);
    expect(stageDir).toBe(join(logsRoot, 'step1'));
  });

  it('sanitizes path-traversal characters in nodeId', async () => {
    const logsRoot = await makeTmpDir();
    const stageDir = await ensureStageDirectory(logsRoot, '../escape');

    // The sanitized name should not contain path separators
    const dirName = stageDir.slice(logsRoot.length + 1);
    expect(dirName).not.toContain('/');
    // The directory should be inside logsRoot
    expect(stageDir.startsWith(logsRoot)).toBe(true);

    const stats = await stat(stageDir);
    expect(stats.isDirectory()).toBe(true);
  });

  it('sanitizes special characters in nodeId', async () => {
    const logsRoot = await makeTmpDir();
    const stageDir = await ensureStageDirectory(logsRoot, 'node/with spaces!');

    expect(stageDir.startsWith(logsRoot)).toBe(true);
    const stats = await stat(stageDir);
    expect(stats.isDirectory()).toBe(true);
  });
});

describe('writeStageFile', () => {
  it('writes a file into the stage directory', async () => {
    const logsRoot = await makeTmpDir();
    const stageDir = await ensureStageDirectory(logsRoot, 'step1');

    await writeStageFile(stageDir, 'output.txt', 'hello world');

    const content = await readFile(join(stageDir, 'output.txt'), 'utf-8');
    expect(content).toBe('hello world');
  });

  it('sanitizes the filename', async () => {
    const logsRoot = await makeTmpDir();
    const stageDir = await ensureStageDirectory(logsRoot, 'step1');

    await writeStageFile(stageDir, '../malicious.txt', 'bad data');

    // The sanitizer replaces '/' with '_', keeping dots. So '../malicious.txt' -> '.._malicious.txt'
    const sanitizedName = '.._malicious.txt';
    const filePath = join(stageDir, sanitizedName);
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('bad data');
  });
});
