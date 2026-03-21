/**
 * @attractor/agent — Tool Registry
 *
 * Central registry for tool definitions and their executors. The agent loop
 * uses the registry to resolve tool calls and provide tool definitions to the
 * LLM provider.
 */

import type { ExecutionEnvironment } from '../env/interface.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  env: ExecutionEnvironment,
) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /** Register a tool. Overwrites any existing tool with the same name. */
  register(tool: RegisteredTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  /** Remove a tool by name. No-op if the tool is not registered. */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /** Look up a registered tool by name. */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /** Return all registered tool definitions (for sending to the LLM). */
  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  /** Return all registered tool names. */
  names(): string[] {
    return [...this.tools.keys()];
  }
}
