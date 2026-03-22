/**
 * @attractor/agent — Local Execution Environment
 *
 * Implements the ExecutionEnvironment interface for local filesystem and
 * process execution using Node.js built-in modules.
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

import type {
  ExecutionEnvironment,
  DirEntry,
  ExecResult,
  GrepOptions,
} from './interface.js';
import { filterEnvironmentVariables } from './env-filter.js';

export class LocalExecutionEnvironment implements ExecutionEnvironment {
  private cwd: string;

  constructor(workingDir?: string) {
    this.cwd = workingDir ?? process.cwd();
  }

  // ---------------------------------------------------------------------------
  // File operations
  // ---------------------------------------------------------------------------

  async readFile(filePath: string, offset?: number, limit?: number): Promise<string> {
    const resolved = this.resolve(filePath);
    const raw = await fs.readFile(resolved, 'utf-8');
    const allLines = raw.split('\n');

    const startLine = Math.max(1, offset ?? 1);
    const maxLines = limit ?? 2000;
    const slice = allLines.slice(startLine - 1, startLine - 1 + maxLines);

    // Format with line numbers: "  1\tcontent"
    return slice
      .map((line, i) => {
        const lineNo = startLine + i;
        const pad = String(lineNo).padStart(6, ' ');
        return `${pad}\t${line}`;
      })
      .join('\n');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = this.resolve(filePath);
    await fs.mkdir(nodePath.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async listDirectory(dirPath: string, depth?: number): Promise<DirEntry[]> {
    const resolved = this.resolve(dirPath);
    const entries: DirEntry[] = [];

    const walk = async (dir: string, currentDepth: number): Promise<void> => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = nodePath.join(dir, item.name);
        let size: number | undefined;
        let modifiedMs: number | undefined;
        try {
          const stat = await fs.stat(fullPath);
          size = stat.size;
          modifiedMs = stat.mtimeMs;
        } catch {
          // Stat may fail for broken symlinks, etc.
        }
        entries.push({
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          size,
          modifiedMs,
        });
        if (item.isDirectory() && (depth === undefined || currentDepth < depth)) {
          await walk(fullPath, currentDepth + 1);
        }
      }
    };

    await walk(resolved, 1);
    return entries;
  }

  // ---------------------------------------------------------------------------
  // Command execution
  // ---------------------------------------------------------------------------

  async execCommand(
    command: string,
    timeoutMs: number,
    workingDir?: string,
    envVars?: Record<string, string>,
  ): Promise<ExecResult> {
    const cwd = workingDir ? this.resolve(workingDir) : this.cwd;
    const filteredEnv = filterEnvironmentVariables(
      process.env as Record<string, string | undefined>,
    );
    const env = envVars ? { ...filteredEnv, ...envVars } : filteredEnv;

    return new Promise<ExecResult>((resolve) => {
      const child = spawn('/bin/bash', ['-c', command], {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      const MAX_BUFFER = 5 * 1024 * 1024; // 5MB max output buffer
      let bufferExceeded = false;

      child.stdout?.on('data', (data: Buffer) => {
        if (bufferExceeded) return;
        stdout += data.toString();
        if (stdout.length + stderr.length > MAX_BUFFER) {
          bufferExceeded = true;
          stdout += '\n[output truncated: exceeded 5MB limit]';
          try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* already exited */ }
        }
      });
      child.stderr?.on('data', (data: Buffer) => {
        if (bufferExceeded) return;
        stderr += data.toString();
        if (stdout.length + stderr.length > MAX_BUFFER) {
          bufferExceeded = true;
          stderr += '\n[output truncated: exceeded 5MB limit]';
          try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* already exited */ }
        }
      });

      const timer = setTimeout(() => {
        timedOut = true;
        // Kill the entire process group
        try {
          process.kill(-child.pid!, 'SIGTERM');
        } catch {
          // Process may have already exited
        }
        // Force kill after 2 seconds
        setTimeout(() => {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {
            // Process may have already exited
          }
        }, 2000);
      }, timeoutMs);

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: exitCode ?? 1,
          timedOut,
        });
      };

      child.on('close', (code) => finish(code));
      child.on('error', () => finish(1));
    });
  }

  // ---------------------------------------------------------------------------
  // Search — delegate to ripgrep/system tools if available
  // ---------------------------------------------------------------------------

  async grep(
    pattern: string,
    searchPath: string,
    options?: GrepOptions,
  ): Promise<string> {
    const resolved = this.resolve(searchPath);
    const args: string[] = ['--line-number', '--color=never'];

    if (options?.caseInsensitive) {
      args.push('--ignore-case');
    }
    if (options?.maxResults) {
      args.push('--max-count', String(options.maxResults));
    }
    if (options?.globFilter) {
      args.push('--glob', options.globFilter);
    }
    args.push('--', pattern, resolved);

    // Try ripgrep first, fall back to grep -rn
    const rgAvailable = await this.commandExists('rg');
    if (rgAvailable) {
      const result = await this.execCommand(
        `rg ${args.map(escapeShellArg).join(' ')}`,
        30_000,
      );
      return result.stdout.trimEnd();
    }

    // Fallback: basic grep
    const grepArgs: string[] = ['-rn', '--color=never'];
    if (options?.caseInsensitive) grepArgs.push('-i');
    if (options?.maxResults) grepArgs.push('-m', String(options.maxResults));
    if (options?.globFilter) grepArgs.push('--include', options.globFilter);
    grepArgs.push('--', pattern, resolved);

    const result = await this.execCommand(
      `grep ${grepArgs.map(escapeShellArg).join(' ')}`,
      30_000,
    );
    return result.stdout.trimEnd();
  }

  async glob(pattern: string, basePath: string): Promise<string[]> {
    const resolved = this.resolve(basePath);

    // Use find + fnmatch as a portable fallback, but prefer fd if available
    const fdAvailable = await this.commandExists('fd');
    if (fdAvailable) {
      const result = await this.execCommand(
        `fd --type f --glob ${escapeShellArg(pattern)} ${escapeShellArg(resolved)}`,
        30_000,
      );
      if (result.exitCode !== 0 || !result.stdout.trim()) return [];
      const files = result.stdout.trim().split('\n');
      return this.sortByModTime(files);
    }

    // Fallback: use find with -name (only works for simple patterns)
    const result = await this.execCommand(
      `find ${escapeShellArg(resolved)} -type f -name ${escapeShellArg(pattern)}`,
      30_000,
    );
    if (result.exitCode !== 0 || !result.stdout.trim()) return [];
    const files = result.stdout.trim().split('\n');
    return this.sortByModTime(files);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle & metadata
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    // Ensure the working directory exists
    await fs.mkdir(this.cwd, { recursive: true });
  }

  async cleanup(): Promise<void> {
    // No-op for local environment
  }

  workingDirectory(): string {
    return this.cwd;
  }

  platform(): string {
    return process.platform;
  }

  osVersion(): string {
    return process.version;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolve(p: string): string {
    const resolved = nodePath.isAbsolute(p) ? nodePath.resolve(p) : nodePath.resolve(this.cwd, p);
    // Enforce path containment within the working directory
    const normalizedCwd = nodePath.resolve(this.cwd);
    if (!resolved.startsWith(normalizedCwd + '/') && resolved !== normalizedCwd) {
      throw new Error(`Path access denied: ${p} is outside the project directory`);
    }
    return resolved;
  }

  private async commandExists(cmd: string): Promise<boolean> {
    try {
      const result = await this.execCommand(`command -v ${cmd}`, 5_000);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  private async sortByModTime(files: string[]): Promise<string[]> {
    const withStats = await Promise.all(
      files.map(async (f) => {
        try {
          const stat = await fs.stat(f);
          return { path: f, mtimeMs: stat.mtimeMs };
        } catch {
          return { path: f, mtimeMs: 0 };
        }
      }),
    );
    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return withStats.map((s) => s.path);
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
