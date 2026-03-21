import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/llm',
  'packages/agent',
  'packages/engine',
  'packages/cli',
]);
