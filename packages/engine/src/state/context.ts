export class Context {
  private values: Map<string, unknown>;
  private logs: string[];

  constructor(initial?: Record<string, unknown>) {
    this.values = new Map<string, unknown>();
    this.logs = [];

    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        this.values.set(key, value);
      }
    }
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  get(key: string, defaultValue?: unknown): unknown {
    if (this.values.has(key)) {
      return this.values.get(key);
    }
    return defaultValue;
  }

  getString(key: string, defaultValue?: string): string {
    const value = this.get(key);
    if (typeof value === 'string') {
      return value;
    }
    return defaultValue ?? '';
  }

  getNumber(key: string, defaultValue?: number): number {
    const value = this.get(key);
    if (typeof value === 'number') {
      return value;
    }
    return defaultValue ?? 0;
  }

  getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = this.get(key);
    if (typeof value === 'boolean') {
      return value;
    }
    return defaultValue ?? false;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  appendLog(entry: string): void {
    this.logs.push(entry);
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  snapshot(): Record<string, unknown> {
    return structuredClone(Object.fromEntries(this.values));
  }

  clone(): Context {
    const cloned = new Context();
    cloned.values = new Map(
      Array.from(this.values.entries()).map(([k, v]) => [k, structuredClone(v)]),
    );
    cloned.logs = [...this.logs];
    return cloned;
  }

  applyUpdates(updates: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(updates)) {
      this.values.set(key, value);
    }
  }

  keys(): string[] {
    return Array.from(this.values.keys());
  }

  entries(): [string, unknown][] {
    return Array.from(this.values.entries());
  }
}
