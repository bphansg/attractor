// @attractor/llm — OpenAI Responses API Request Translation
// Translates a unified Request into the OpenAI Responses API format.

import type { Request, Message, ContentPart, ToolChoice, Tool, ResponseFormat } from '../../types/index.js';

// ── OpenAI Responses API Input Types ─────────────────────────────────────────

interface OpenAIInputItem {
  type: string;
  role?: string;
  content?: unknown;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
  status?: string;
  [key: string]: unknown;
}

interface OpenAITool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

interface OpenAITextConfig {
  format?: OpenAITextFormat;
}

type OpenAITextFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; name: string; schema: Record<string, unknown>; strict?: boolean };

export interface OpenAIRequestBody {
  model: string;
  input: OpenAIInputItem[];
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  reasoning?: { effort: 'low' | 'medium' | 'high' };
  text?: OpenAITextConfig;
  [key: string]: unknown;
}

// ── Translate Request ────────────────────────────────────────────────────────

/**
 * Translate a unified Request into the OpenAI Responses API body.
 */
export function translateRequest(request: Request, stream: boolean): OpenAIRequestBody {
  const body: OpenAIRequestBody = {
    model: request.model,
    input: translateMessages(request.messages),
    stream,
  };

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map(translateTool);
  }

  if (request.toolChoice !== undefined) {
    body.tool_choice = translateToolChoice(request.toolChoice);
  }

  if (request.maxTokens !== undefined) {
    body.max_output_tokens = request.maxTokens;
  }

  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }

  if (request.topP !== undefined) {
    body.top_p = request.topP;
  }

  if (request.stop !== undefined) {
    body.stop = request.stop;
  }

  if (request.reasoningEffort !== undefined) {
    body.reasoning = { effort: request.reasoningEffort };
  }

  if (request.responseFormat !== undefined) {
    body.text = translateResponseFormat(request.responseFormat);
  }

  // Merge any provider-specific options directly into the body.
  if (request.providerOptions) {
    for (const [key, value] of Object.entries(request.providerOptions)) {
      body[key] = value;
    }
  }

  return body;
}

// ── Message Translation ──────────────────────────────────────────────────────

function translateMessages(messages: Message[]): OpenAIInputItem[] {
  const items: OpenAIInputItem[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        items.push(translateSystemMessage(msg));
        break;
      case 'user':
        items.push(translateUserMessage(msg));
        break;
      case 'assistant':
        items.push(...translateAssistantMessage(msg));
        break;
      case 'tool':
        items.push(...translateToolMessage(msg));
        break;
    }
  }

  return items;
}

function translateSystemMessage(msg: Message): OpenAIInputItem {
  const text = typeof msg.content === 'string'
    ? msg.content
    : extractTextFromParts(msg.content);

  return {
    type: 'message',
    role: 'developer',
    content: text,
  };
}

function translateUserMessage(msg: Message): OpenAIInputItem {
  if (typeof msg.content === 'string') {
    return {
      type: 'message',
      role: 'user',
      content: msg.content,
    };
  }

  const contentParts = msg.content.map(translateContentPart).filter(Boolean);
  return {
    type: 'message',
    role: 'user',
    content: contentParts,
  };
}

function translateAssistantMessage(msg: Message): OpenAIInputItem[] {
  const items: OpenAIInputItem[] = [];

  if (typeof msg.content === 'string') {
    items.push({
      type: 'message',
      role: 'assistant',
      content: msg.content,
    });
    return items;
  }

  // Collect text parts into a message, and tool_call parts into separate function_call items.
  const textParts: string[] = [];

  for (const part of msg.content) {
    if (part.kind === 'text') {
      textParts.push(part.text);
    } else if (part.kind === 'tool_call') {
      // If we have accumulated text, emit a message item first.
      if (textParts.length > 0) {
        items.push({
          type: 'message',
          role: 'assistant',
          content: textParts.join('\n'),
        });
        textParts.length = 0;
      }
      items.push({
        type: 'function_call',
        id: part.toolCall.id,
        call_id: part.toolCall.id,
        name: part.toolCall.name,
        arguments: JSON.stringify(part.toolCall.arguments),
      });
    }
  }

  // Emit any remaining text.
  if (textParts.length > 0) {
    items.push({
      type: 'message',
      role: 'assistant',
      content: textParts.join('\n'),
    });
  }

  return items;
}

function translateToolMessage(msg: Message): OpenAIInputItem[] {
  if (typeof msg.content === 'string') {
    return [];
  }

  return msg.content
    .filter((part): part is Extract<ContentPart, { kind: 'tool_result' }> => part.kind === 'tool_result')
    .map((part) => ({
      type: 'function_call_output',
      call_id: part.toolResult.toolCallId,
      output: part.toolResult.content,
      ...(part.toolResult.isError && { status: 'error' }),
    }));
}

// ── Content Part Translation ─────────────────────────────────────────────────

function translateContentPart(part: ContentPart): unknown {
  switch (part.kind) {
    case 'text':
      return { type: 'input_text', text: part.text };
    case 'image': {
      if (part.source.type === 'url' && part.source.url) {
        return { type: 'input_image', image_url: part.source.url };
      }
      if (part.source.type === 'base64' && part.source.data) {
        const mediaType = part.source.mediaType ?? 'image/png';
        return {
          type: 'input_image',
          image_url: `data:${mediaType};base64,${part.source.data}`,
        };
      }
      return null;
    }
    case 'document': {
      if (part.source.type === 'url' && part.source.url) {
        return { type: 'input_file', file_url: part.source.url };
      }
      if (part.source.type === 'base64' && part.source.data) {
        return {
          type: 'input_file',
          file_data: part.source.data,
          filename: 'document',
        };
      }
      return null;
    }
    default:
      return null;
  }
}

// ── Tool Translation ─────────────────────────────────────────────────────────

function translateTool(tool: Tool): OpenAITool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function translateToolChoice(
  choice: ToolChoice,
): 'auto' | 'none' | 'required' | { type: 'function'; name: string } {
  if (typeof choice === 'string') {
    return choice;
  }
  return { type: 'function', name: choice.name };
}

// ── Response Format Translation ──────────────────────────────────────────────

function translateResponseFormat(format: ResponseFormat): OpenAITextConfig {
  switch (format.type) {
    case 'text':
      return { format: { type: 'text' } };
    case 'json_object':
      return { format: { type: 'json_object' } };
    case 'json_schema':
      return {
        format: {
          type: 'json_schema',
          name: format.name ?? 'response',
          schema: format.schema ?? {},
          ...(format.strict !== undefined && { strict: format.strict }),
        },
      };
    default:
      return {};
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractTextFromParts(parts: ContentPart[]): string {
  return parts
    .filter((p): p is Extract<ContentPart, { kind: 'text' }> => p.kind === 'text')
    .map((p) => p.text)
    .join('\n');
}
