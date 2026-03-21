// @attractor/llm — Unified LLM Client
export * from './types/index.js';
export * from './client.js';
export * from './middleware.js';
export * from './providers/adapter.js';

// Provider adapters and their config types.
// We avoid `export *` from provider barrels because they all export
// translateRequest / translateResponse / translateStream which would conflict.
export { OpenAIAdapter } from './providers/openai/index.js';
export type { OpenAIAdapterConfig } from './providers/openai/index.js';
export { AnthropicAdapter } from './providers/anthropic/index.js';
export type { AnthropicAdapterConfig } from './providers/anthropic/index.js';
export { GeminiAdapter } from './providers/gemini/index.js';
export type { GeminiAdapterConfig } from './providers/gemini/index.js';

// High-level API functions.
export * from './api/index.js';
