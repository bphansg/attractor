/**
 * @attractor/agent — Execution Environment Interface
 *
 * Defines the contract that all execution environments must implement.
 * This abstraction allows the agent loop to operate against local filesystems,
 * remote containers, or sandboxed environments using the same interface.
 */

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface GrepOptions {
  globFilter?: string;
  caseInsensitive?: boolean;
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Execution environment
// ---------------------------------------------------------------------------

export interface ExecutionEnvironment {
  // File operations
  readFile(filePath: string, offset?: number, limit?: number): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  fileExists(filePath: string): Promise<boolean>;
  listDirectory(dirPath: string, depth?: number): Promise<DirEntry[]>;

  // Command execution
  execCommand(
    command: string,
    timeoutMs: number,
    workingDir?: string,
    envVars?: Record<string, string>,
  ): Promise<ExecResult>;

  // Search
  grep(pattern: string, searchPath: string, options?: GrepOptions): Promise<string>;
  glob(pattern: string, basePath: string): Promise<string[]>;

  // Lifecycle
  initialize(): Promise<void>;
  cleanup(): Promise<void>;

  // Metadata
  workingDirectory(): string;
  platform(): string;
  osVersion(): string;
}
