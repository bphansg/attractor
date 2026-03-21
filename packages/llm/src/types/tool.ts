/**
 * @attractor/llm — Tool Types
 *
 * Defines the interfaces for tool definitions, tool calls, and tool results
 * used across all LLM providers.
 */

/** A tool definition that can be passed to a model. */
export interface Tool {
  /** The unique name of the tool. */
  name: string;
  /** A description of what the tool does, used by the model to decide when to call it. */
  description: string;
  /** JSON Schema describing the tool's parameters. The root must be of type "object". */
  parameters: Record<string, unknown>;
}

/** A tool call returned by the model. */
export interface ToolCall {
  /** Provider-assigned identifier for this tool call. */
  id: string;
  /** The name of the tool to invoke. */
  name: string;
  /** The parsed arguments to pass to the tool. */
  arguments: Record<string, unknown>;
}

/** The result of executing a tool call. */
export interface ToolResult {
  /** The id of the tool call this result corresponds to. */
  toolCallId: string;
  /** The string content returned by the tool. */
  content: string;
  /** Whether the tool execution resulted in an error. */
  isError?: boolean;
}

/** Controls how the model selects tools. */
export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; name: string };
