/**
 * @attractor/llm — Message Types
 *
 * Defines the message structure, content parts (tagged union), and convenience
 * constructors for building conversations across all LLM providers.
 */

import type { ToolCall, ToolResult } from './tool.js';

// ---------------------------------------------------------------------------
// Role
// ---------------------------------------------------------------------------

/** The role of a message participant. */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

// ---------------------------------------------------------------------------
// Content kinds (discriminant for tagged union)
// ---------------------------------------------------------------------------

/** Discriminant values for the ContentPart tagged union. */
export type ContentKind =
  | 'text'
  | 'image'
  | 'audio'
  | 'document'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'redacted_thinking';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/** Cache control hint for Anthropic-style prompt caching. */
export interface CacheControl {
  type: 'ephemeral';
}

/** Source descriptor for inline or URL-referenced images. */
export interface ImageSource {
  type: 'base64' | 'url';
  mediaType?: string;
  data?: string;
  url?: string;
}

/** Source descriptor for inline or URL-referenced documents. */
export interface DocumentSource {
  type: 'base64' | 'url';
  mediaType?: string;
  data?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// ContentPart — tagged union
// ---------------------------------------------------------------------------

export interface TextContent {
  kind: 'text';
  text: string;
  cacheControl?: CacheControl;
}

export interface ImageContent {
  kind: 'image';
  source: ImageSource;
  cacheControl?: CacheControl;
}

export interface AudioContent {
  kind: 'audio';
  data: string;
  format: string;
}

export interface DocumentContent {
  kind: 'document';
  source: DocumentSource;
  cacheControl?: CacheControl;
}

export interface ToolCallContent {
  kind: 'tool_call';
  toolCall: ToolCall;
}

export interface ToolResultContent {
  kind: 'tool_result';
  toolResult: ToolResult;
}

export interface ThinkingContent {
  kind: 'thinking';
  text: string;
  signature?: string;
}

export interface RedactedThinkingContent {
  kind: 'redacted_thinking';
  data: string;
}

/** A single piece of content within a message. */
export type ContentPart =
  | TextContent
  | ImageContent
  | AudioContent
  | DocumentContent
  | ToolCallContent
  | ToolResultContent
  | ThinkingContent
  | RedactedThinkingContent;

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

/** A single message in a conversation. */
export interface Message {
  role: Role;
  content: string | ContentPart[];
}

// ---------------------------------------------------------------------------
// Message convenience constructors (namespace-style)
// ---------------------------------------------------------------------------

/** Extract all text from a message, joining multiple text parts with newlines. */
function extractText(msg: Message): string {
  if (typeof msg.content === 'string') {
    return msg.content;
  }
  return msg.content
    .filter((part): part is TextContent => part.kind === 'text')
    .map((part) => part.text)
    .join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Message {
  /** Create a system message. */
  export function system(text: string): Message {
    return { role: 'system', content: text };
  }

  /** Create a user message. */
  export function user(content: string | ContentPart[]): Message {
    return { role: 'user', content };
  }

  /** Create an assistant message. */
  export function assistant(content: string | ContentPart[]): Message {
    return { role: 'assistant', content };
  }

  /** Create a tool-result message from one or more tool results. */
  export function tool(results: ToolResult[]): Message {
    const content: ToolResultContent[] = results.map((result) => ({
      kind: 'tool_result' as const,
      toolResult: result,
    }));
    return { role: 'tool', content };
  }

  /** Extract all text content from a message. */
  export function text(msg: Message): string {
    return extractText(msg);
  }
}
