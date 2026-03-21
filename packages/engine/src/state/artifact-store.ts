import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export interface ArtifactInfo {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  fileBacked: boolean;
}

const DEFAULT_FILE_SIZE_THRESHOLD = 100 * 1024; // 100KB

export class ArtifactStore {
  private artifacts: Map<string, { info: ArtifactInfo; data: unknown }>;
  private baseDir: string | null;
  private fileSizeThreshold: number;

  constructor(baseDir?: string) {
    this.artifacts = new Map();
    this.baseDir = baseDir ?? null;
    this.fileSizeThreshold = DEFAULT_FILE_SIZE_THRESHOLD;
  }

  private artifactDir(): string {
    if (!this.baseDir) {
      throw new Error('ArtifactStore: baseDir is required for file-backed artifacts');
    }
    return join(this.baseDir, 'artifacts');
  }

  private artifactPath(id: string): string {
    return join(this.artifactDir(), `${id}.json`);
  }

  private computeSize(data: unknown): number {
    return Buffer.byteLength(JSON.stringify(data), 'utf-8');
  }

  async store(id: string, name: string, data: unknown): Promise<ArtifactInfo> {
    const size = this.computeSize(data);
    const fileBacked = size >= this.fileSizeThreshold && this.baseDir !== null;

    const info: ArtifactInfo = {
      id,
      name,
      size,
      createdAt: new Date().toISOString(),
      fileBacked,
    };

    if (fileBacked) {
      const dir = this.artifactDir();
      await mkdir(dir, { recursive: true });
      await writeFile(this.artifactPath(id), JSON.stringify(data), 'utf-8');
      this.artifacts.set(id, { info, data: null });
    } else {
      this.artifacts.set(id, { info, data });
    }

    return info;
  }

  async retrieve(id: string): Promise<unknown> {
    const entry = this.artifacts.get(id);
    if (!entry) {
      throw new Error(`ArtifactStore: artifact "${id}" not found`);
    }

    if (entry.info.fileBacked) {
      const raw = await readFile(this.artifactPath(id), 'utf-8');
      return JSON.parse(raw) as unknown;
    }

    return entry.data;
  }

  has(id: string): boolean {
    return this.artifacts.has(id);
  }

  list(): ArtifactInfo[] {
    return Array.from(this.artifacts.values()).map((entry) => entry.info);
  }

  async remove(id: string): Promise<void> {
    const entry = this.artifacts.get(id);
    if (!entry) {
      return;
    }

    if (entry.info.fileBacked) {
      try {
        await rm(this.artifactPath(id));
      } catch {
        // File may already be removed; ignore
      }
    }

    this.artifacts.delete(id);
  }

  clear(): void {
    this.artifacts.clear();
  }
}
