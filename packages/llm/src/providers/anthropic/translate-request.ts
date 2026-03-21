// @attractor/llm — Anthropic Request Translation
// Translates unified Request -> Anthropic Messages API format.

import type { Request } from '../../types/request.js';
import type {
  Message,
  ContentPart,
  TextContent,
  ImageContent,
  DocumentContent,
  ToolCallContent,
  ToolResultContent,
  ThinkingContent,
  RedactedThinkingContent,
  CacheControl,
} from '../../types/message.js';
import type { Tool, ToolChoice } from '../../types/tool.js';

// ── Anthropic API Types ─────────────────────────────────────────────────────

/** Anthropic content block types sent in the request body. */
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicDocumentBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicThinkingBlock
  | AnthropicRedactedThinkingBlock;

interface AnthropicTextBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}

interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type?: string;
    data?: string;
    url?: string;
  };
  cache_control?: CacheControl;
}

interface AnthropicDocumentBlock {
  type: 'document';
  source: {
    type: 'base64' | 'url';
    media_type?: string;
    data?: string;
    url?: string;
  };
  cache_control?: CacheControl;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature: string;
}

interface AnthropicRedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicSystemBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}

interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'none' }
  | { type: 'tool'; name: string };

interface AnthropicThinkingConfig {
  type: 'enabled';
  budget_tokens: number;
}

export interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: AnthropicSystemBlock[];
  tools?: AnthropicToolDef[];
  tool_choice?: AnthropicToolChoice;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  thinking?: AnthropicThinkingConfig;
  metadata?: Record<string, unknown>;
}

// ── Budget mapping for reasoning effort ─────────────────────────────────────

const REASONING_BUDGET: Record<string, number> = {
  low: 1024,
  medium: 4096,
  high: 10240,
};

// ── Default max_tokens ──────────────────────────────────────────────────────

const DEFAULT_MAX_TOKENS = 4096;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Translate a unified Request into the Anthropic Messages API request body.
 */
export function translateRequest(
  request: Request,
  options?: { stream?: boolean },
): AnthropicRequestBody {
  const { systemBlocks, messages } = extractSystemAndMessages(request.messages);
  const mergedMessages = mergeConsecutiveSameRole(messages);

  const body: AnthropicRequestBody = {
    model: request.model,
    messages: mergedMessages.map(translateMessage),
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
  };

  if (systemBlocks.length > 0) {
    body.system = systemBlocks;
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map(translateTool);
  }

  if (request.toolChoice !== undefined) {
    body.tool_choice = translateToolChoice(request.toolChoice);
  }

  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }

  if (request.topP !== undefined) {
    body.top_p = request.topP;
  }

  if (request.stop && request.stop.length > 0) {
    body.stop_sequences = request.stop;
  }

  if (request.reasoningEffort) {
    const budgetTokens = REASONING_BUDGET[request.reasoningEffort];
    if (budgetTokens) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: budgetTokens,
      };
    }
  }

  if (options?.stream) {
    body.stream = true;
  }

  return body;
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Extract system messages from the message array. Anthropic requires
 * system content as a top-level field, not in the messages array.
 */
function extractSystemAndMessages(messages: Message[]): {
  systemBlocks: AnthropicSystemBlock[];
  messages: Message[];
} {
  const systemBlocks: AnthropicSystemBlock[] = [];
  const nonSystemMessages: Message[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemBlocks.push({ type: 'text', text: msg.content });
      } else {
        // Extract text parts from structured content, preserving cache_control.
        for (const part of msg.content) {
          if (part.kind === 'text') {
            const block: AnthropicSystemBlock = { type: 'text', text: part.text };
            if (part.cacheControl) {
              block.cache_control = part.cacheControl;
            }
            systemBlocks.push(block);
          }
        }
      }
    } else {
      nonSystemMessages.push(msg);
    }
  }

  return { systemBlocks, messages: nonSystemMessages };
}

/**
 * Anthropic requires alternating user/assistant messages. Merge consecutive
 * messages with the same role into a single message with array content.
 */
function mergeConsecutiveSameRole(messages: Message[]): Message[] {
  if (messages.length === 0) return [];

  const result: Message[] = [];
  let current: Message = messages[0];

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    const currentRole = effectiveRole(current);
    const msgRole = effectiveRole(msg);

    if (msgRole === currentRole) {
      // Merge into current.
      current = {
        role: current.role,
        content: [...normalizeContent(current.content), ...normalizeContent(msg.content)],
      };
    } else {
      result.push(current);
      current = msg;
    }
  }

  result.push(current);
  return result;
}

/**
 * Map unified roles to Anthropic roles.
 * 'tool' role messages become 'user' role in Anthropic format.
 */
function effectiveRole(msg: Message): 'user' | 'assistant' {
  return msg.role === 'assistant' ? 'assistant' : 'user';
}

/**
 * Normalize message content to always be an array of ContentPart.
 */
function normalizeContent(content: string | ContentPart[]): ContentPart[] {
  if (typeof content === 'string') {
    return [{ kind: 'text', text: content }];
  }
  return content;
}

/**
 * Translate a unified Message to an Anthropic message.
 */
function translateMessage(msg: Message): AnthropicMessage {
  const role = effectiveRole(msg);

  if (typeof msg.content === 'string') {
    return { role, content: msg.content };
  }

  const blocks = msg.content.map(translateContentPart).filter(Boolean) as AnthropicContentBlock[];
  return { role, content: blocks };
}

/**
 * Translate a single unified ContentPart to an Anthropic content block.
 */
function translateContentPart(part: ContentPart): AnthropicContentBlock | null {
  switch (part.kind) {
    case 'text':
      return translateTextPart(part);
    case 'image':
      return translateImagePart(part);
    case 'document':
      return translateDocumentPart(part);
    case 'tool_call':
      return translateToolCallPart(part);
    case 'tool_result':
      return translateToolResultPart(part);
    case 'thinking':
      return translateThinkingPart(part);
    case 'redacted_thinking':
      return translateRedactedThinkingPart(part);
    case 'audio':
      // Anthropic does not support audio content blocks.
      return null;
    default:
      return null;
  }
}

function translateTextPart(part: TextContent): AnthropicTextBlock {
  const block: AnthropicTextBlock = { type: 'text', text: part.text };
  if (part.cacheControl) {
    block.cache_control = part.cacheControl;
  }
  return block;
}

function translateImagePart(part: ImageContent): AnthropicImageBlock {
  const block: AnthropicImageBlock = {
    type: 'image',
    source: {
      type: part.source.type,
      ...(part.source.mediaType && { media_type: part.source.mediaType }),
      ...(part.source.data && { data: part.source.data }),
      ...(part.source.url && { url: part.source.url }),
    },
  };
  if (part.cacheControl) {
    block.cache_control = part.cacheControl;
  }
  return block;
}

function translateDocumentPart(part: DocumentContent): AnthropicDocumentBlock {
  const block: AnthropicDocumentBlock = {
    type: 'document',
    source: {
      type: part.source.type,
      ...(part.source.mediaType && { media_type: part.source.mediaType }),
      ...(part.source.data && { data: part.source.data }),
      ...(part.source.url && { url: part.source.url }),
    },
  };
  if (part.cacheControl) {
    block.cache_control = part.cacheControl;
  }
  return block;
}

function translateToolCallPart(part: ToolCallContent): AnthropicToolUseBlock {
  return {
    type: 'tool_use',
    id: part.toolCall.id,
    name: part.toolCall.name,
    input: part.toolCall.arguments,
  };
}

function translateToolResultPart(part: ToolResultContent): AnthropicToolResultBlock {
  const block: AnthropicToolResultBlock = {
    type: 'tool_result',
    tool_use_id: part.toolResult.toolCallId,
    content: part.toolResult.content,
  };
  if (part.toolResult.isError) {
    block.is_error = true;
  }
  return block;
}

function translateThinkingPart(part: ThinkingContent): AnthropicThinkingBlock {
  return {
    type: 'thinking',
    thinking: part.text,
    signature: part.signature ?? '',
  };
}

function translateRedactedThinkingPart(part: RedactedThinkingContent): AnthropicRedactedThinkingBlock {
  return {
    type: 'redacted_thinking',
    data: part.data,
  };
}

/**
 * Translate unified Tool definitions to Anthropic tool format.
 */
function translateTool(tool: Tool): AnthropicToolDef {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

/**
 * Translate unified ToolChoice to Anthropic tool_choice format.
 */
function translateToolChoice(choice: ToolChoice): AnthropicToolChoice {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'none' };
  if (choice === 'required') return { type: 'any' };
  // Named tool choice: { type: 'function', name: string }
  return { type: 'tool', name: choice.name };
}
