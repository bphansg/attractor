// @attractor/llm — OpenAI Responses API Response Translation
// Translates an OpenAI Responses API response into a unified Response.

import type { Response, FinishReason, Usage, ContentPart, ToolCall, TextContent, ToolCallContent } from '../../types/index.js';

// ── OpenAI Response Types ────────────────────────────────────────────────────

interface OpenAIOutputTextContent {
  type: 'output_text';
  text: string;
}

interface OpenAIMessageOutput {
  type: 'message';
  id?: string;
  role?: string;
  content: OpenAIOutputTextContent[];
}

interface OpenAIFunctionCallOutput {
  type: 'function_call';
  id: string;
  call_id?: string;
  name: string;
  arguments: string;
  status?: string;
}

type OpenAIOutputItem = OpenAIMessageOutput | OpenAIFunctionCallOutput;

interface OpenAIUsage {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface OpenAIResponseBody {
  id: string;
  model: string;
  output: OpenAIOutputItem[];
  usage: OpenAIUsage;
  status?: string;
  error?: {
    code?: string;
    message?: string;
  };
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// ── Translate Response ───────────────────────────────────────────────────────

/**
 * Translate an OpenAI Responses API response body into a unified Response.
 */
export function translateResponse(raw: OpenAIResponseBody): Response {
  const text = extractText(raw.output);
  const toolCalls = extractToolCalls(raw.output);
  const content = buildContent(raw.output);
  const finishReason = mapFinishReason(raw.status, toolCalls.length > 0);
  const usage = mapUsage(raw.usage);

  return {
    id: raw.id,
    model: raw.model,
    text,
    content,
    toolCalls,
    finishReason,
    usage,
    providerMetadata: raw.metadata,
  };
}

// ── Output Extraction ────────────────────────────────────────────────────────

function extractText(output: OpenAIOutputItem[]): string {
  const textParts: string[] = [];

  for (const item of output) {
    if (item.type === 'message' && item.content) {
      for (const part of item.content) {
        if (part.type === 'output_text') {
          textParts.push(part.text);
        }
      }
    }
  }

  return textParts.join('');
}

function extractToolCalls(output: OpenAIOutputItem[]): ToolCall[] {
  const calls: ToolCall[] = [];

  for (const item of output) {
    if (item.type === 'function_call') {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(item.arguments) as Record<string, unknown>;
      } catch {
        parsedArgs = { _raw: item.arguments };
      }

      calls.push({
        id: item.call_id ?? item.id,
        name: item.name,
        arguments: parsedArgs,
      });
    }
  }

  return calls;
}

function buildContent(output: OpenAIOutputItem[]): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const item of output) {
    if (item.type === 'message' && item.content) {
      for (const part of item.content) {
        if (part.type === 'output_text') {
          parts.push({ kind: 'text', text: part.text } satisfies TextContent);
        }
      }
    } else if (item.type === 'function_call') {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(item.arguments) as Record<string, unknown>;
      } catch {
        parsedArgs = { _raw: item.arguments };
      }

      parts.push({
        kind: 'tool_call',
        toolCall: {
          id: item.call_id ?? item.id,
          name: item.name,
          arguments: parsedArgs,
        },
      } satisfies ToolCallContent);
    }
  }

  return parts;
}

// ── Finish Reason Mapping ────────────────────────────────────────────────────

function mapFinishReason(status: string | undefined, hasToolCalls: boolean): FinishReason {
  switch (status) {
    case 'completed':
      return hasToolCalls ? 'tool_calls' : 'stop';
    case 'incomplete':
      return 'length';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'error';
    default:
      return hasToolCalls ? 'tool_calls' : 'stop';
  }
}

// ── Usage Mapping ────────────────────────────────────────────────────────────

function mapUsage(usage: OpenAIUsage): Usage {
  const reasoningTokens =
    usage.reasoning_tokens ??
    usage.output_tokens_details?.reasoning_tokens;

  const cacheReadTokens = usage.input_tokens_details?.cached_tokens;

  return {
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
    ...(reasoningTokens !== undefined && { reasoningTokens }),
    ...(cacheReadTokens !== undefined && { cacheReadTokens }),
  };
}
