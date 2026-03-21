// Ambient type declarations for Web APIs available in Node.js 20+.
// These avoid depending on the full DOM lib or @types/node while still
// providing type safety for fetch, ReadableStream, AbortController, etc.

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Fetch API ────────────────────────────────────────────────────────────────

declare function fetch(input: string | URL, init?: RequestInit): Promise<FetchResponse>;

interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | ReadableStream;
  signal?: AbortSignal;
}

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  json(): Promise<any>;
  text(): Promise<string>;
}

interface Headers {
  get(name: string): string | null;
  has(name: string): boolean;
  forEach(callback: (value: string, key: string) => void): void;
}

// ── Streams ──────────────────────────────────────────────────────────────────

interface ReadableStream<R = any> {
  getReader(): ReadableStreamDefaultReader<R>;
  [Symbol.asyncIterator](): AsyncIterableIterator<R>;
}

interface ReadableStreamDefaultReader<R = any> {
  read(): Promise<ReadableStreamReadResult<R>>;
  cancel(reason?: any): Promise<void>;
  releaseLock(): void;
}

type ReadableStreamReadResult<T> =
  | { done: false; value: T }
  | { done: true; value: undefined };

interface ReadableStreamDefaultController<R = any> {
  enqueue(chunk: R): void;
  close(): void;
  error(e?: any): void;
}

declare const ReadableStream: {
  new <R = any>(underlyingSource?: UnderlyingSource<R>): ReadableStream<R>;
};

interface UnderlyingSource<R = any> {
  start?: (controller: ReadableStreamDefaultController<R>) => void | Promise<void>;
  pull?: (controller: ReadableStreamDefaultController<R>) => void | Promise<void>;
  cancel?: (reason?: any) => void | Promise<void>;
}

// ── AbortController / AbortSignal ────────────────────────────────────────────

interface AbortSignal {
  readonly aborted: boolean;
  readonly reason?: any;
  addEventListener(type: string, listener: (...args: any[]) => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: (...args: any[]) => void): void;
}

interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: any): void;
}

declare const AbortController: {
  new (): AbortController;
};

// ── TextDecoder ──────────────────────────────────────────────────────────────

interface TextDecoder {
  decode(input?: ArrayBuffer | Uint8Array, options?: { stream?: boolean }): string;
}

declare const TextDecoder: {
  new (label?: string): TextDecoder;
};

// ── Timers ───────────────────────────────────────────────────────────────────

declare function setTimeout(callback: (...args: any[]) => void, ms?: number, ...args: any[]): number;
declare function clearTimeout(id: number | undefined): void;

// ── DOMException ─────────────────────────────────────────────────────────────

declare class DOMException extends Error {
  constructor(message?: string, name?: string);
  readonly name: string;
  readonly message: string;
}

// ── process (for existing client.ts usage) ───────────────────────────────────

declare const process: { env: Record<string, string | undefined> };
