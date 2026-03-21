// @attractor/llm — Gemini Response Translation
// Translates Gemini generateContent response → unified Response.

import type { Response, FinishReason, Usage } from '../../types/response.js';
import type { ContentPart } from '../../types/message.js';
import type { ToolCall } from '../../types/tool.js';

// ── Gemini response types ────────────────────────────────────────────────────

export interface GeminiResponsePart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
}

export interface GeminiCandidate {
  content?: {
    parts?: GeminiResponsePart[];
    role?: string;
  };
  finishReason?: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
    blocked?: boolean;
  }>;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

// ── Translation ──────────────────────────────────────────────────────────────

let callCounter = 0;

/**
 * Generate a synthetic tool call ID since Gemini doesn't provide them.
 */
function generateCallId(): string {
  return `gemini_call_${Date.now()}_${++callCounter}`;
}

/**
 * Translate a Gemini generateContent response to a unified Response.
 */
export function translateResponse(geminiResponse: GeminiResponse, model: string): Response {
  const candidate = geminiResponse.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  // Extract text content.
  const textParts: string[] = [];
  const content: ContentPart[] = [];
  const toolCalls: ToolCall[] = [];

  for (const part of parts) {
    if (part.text !== undefined) {
      textParts.push(part.text);
      content.push({ kind: 'text', text: part.text });
    }

    if (part.functionCall) {
      const toolCall: ToolCall = {
        id: generateCallId(),
        name: part.functionCall.name,
        arguments: part.functionCall.args ?? {},
      };
      toolCalls.push(toolCall);
      content.push({
        kind: 'tool_call',
        toolCall,
      });
    }
  }

  const text = textParts.join('');
  const finishReason = mapFinishReason(candidate?.finishReason);
  const usage = mapUsage(geminiResponse.usageMetadata);

  return {
    id: `gemini_${Date.now()}`,
    model,
    text,
    content,
    toolCalls,
    finishReason,
    usage,
    providerMetadata: {
      provider: 'gemini',
      ...(candidate?.safetyRatings && { safetyRatings: candidate.safetyRatings }),
      ...(geminiResponse.modelVersion && { modelVersion: geminiResponse.modelVersion }),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapFinishReason(reason?: string): FinishReason {
  if (!reason) return 'stop';

  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
      return 'content_filter';
    case 'RECITATION':
      return 'content_filter';
    case 'FINISH_REASON_UNSPECIFIED':
      return 'stop';
    default:
      return 'stop';
  }
}

function mapUsage(metadata?: GeminiUsageMetadata): Usage {
  const promptTokens = metadata?.promptTokenCount ?? 0;
  const completionTokens = metadata?.candidatesTokenCount ?? 0;
  const totalTokens = metadata?.totalTokenCount ?? (promptTokens + completionTokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}
