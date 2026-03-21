// @attractor/llm — Anthropic Response Translation
// Translates Anthropic Messages API response -> unified Response.

import type { Response, FinishReason, Usage } from '../../types/response.js';
import type { ContentPart, ThinkingContent, RedactedThinkingContent } from '../../types/message.js';
import type { ToolCall } from '../../types/tool.js';

// ── Anthropic API Response Types ────────────────────────────────────────────

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

interface AnthropicRedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicThinkingBlock
  | AnthropicRedactedThinkingBlock;

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface AnthropicResponseBody {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  stop_sequence?: string | null;
  usage: AnthropicUsage;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Translate an Anthropic Messages API response body into a unified Response.
 */
export function translateResponse(body: AnthropicResponseBody): Response {
  const content = translateContentBlocks(body.content);
  const toolCalls = extractToolCalls(body.content);
  const textParts = extractText(body.content);
  const reasoning = extractReasoning(body.content);

  return {
    id: body.id,
    model: body.model,
    text: textParts,
    content,
    toolCalls,
    finishReason: translateStopReason(body.stop_reason),
    usage: translateUsage(body.usage),
    ...(reasoning && { reasoning }),
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Translate all Anthropic content blocks to unified ContentPart array.
 */
function translateContentBlocks(blocks: AnthropicContentBlock[]): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        parts.push({ kind: 'text', text: block.text });
        break;
      case 'tool_use':
        parts.push({
          kind: 'tool_call',
          toolCall: {
            id: block.id,
            name: block.name,
            arguments: block.input,
          },
        });
        break;
      case 'thinking':
        parts.push({
          kind: 'thinking',
          text: block.thinking,
          ...(block.signature && { signature: block.signature }),
        } satisfies ThinkingContent);
        break;
      case 'redacted_thinking':
        parts.push({
          kind: 'redacted_thinking',
          data: block.data,
        } satisfies RedactedThinkingContent);
        break;
    }
  }

  return parts;
}

/**
 * Extract ToolCall objects from Anthropic tool_use blocks.
 */
function extractToolCalls(blocks: AnthropicContentBlock[]): ToolCall[] {
  const calls: ToolCall[] = [];

  for (const block of blocks) {
    if (block.type === 'tool_use') {
      calls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      });
    }
  }

  return calls;
}

/**
 * Join all text blocks into a single string.
 */
function extractText(blocks: AnthropicContentBlock[]): string {
  return blocks
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Join all thinking blocks into a single reasoning string.
 */
function extractReasoning(blocks: AnthropicContentBlock[]): string | undefined {
  const thinkingTexts = blocks
    .filter((b): b is AnthropicThinkingBlock => b.type === 'thinking')
    .map((b) => b.thinking);

  return thinkingTexts.length > 0 ? thinkingTexts.join('\n') : undefined;
}

/**
 * Map Anthropic stop_reason to unified FinishReason.
 */
function translateStopReason(stopReason: string | null): FinishReason {
  switch (stopReason) {
    case 'end_turn':
      return 'stop';
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    case 'stop_sequence':
      return 'stop';
    default:
      return 'stop';
  }
}

/**
 * Translate Anthropic usage to unified Usage, including cache token stats.
 */
function translateUsage(usage: AnthropicUsage): Usage {
  const promptTokens = usage.input_tokens;
  const completionTokens = usage.output_tokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    ...(usage.cache_read_input_tokens != null && {
      cacheReadTokens: usage.cache_read_input_tokens,
    }),
    ...(usage.cache_creation_input_tokens != null && {
      cacheWriteTokens: usage.cache_creation_input_tokens,
    }),
  };
}
