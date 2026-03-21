// @attractor/llm — Gemini Request Translation
// Translates unified Request → Gemini generateContent format.

import type { Request, ResponseFormat } from '../../types/request.js';
import type { Message, ContentPart, TextContent, ImageContent, ToolCallContent, ToolResultContent } from '../../types/message.js';
import type { Tool, ToolChoice } from '../../types/tool.js';

// ── Gemini API types ─────────────────────────────────────────────────────────

/** A single part within a Gemini content item. */
export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: unknown } } };

/** A Gemini content item (maps to a message). */
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Gemini function declaration (tool definition). */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** Gemini tool configuration. */
export interface GeminiToolConfig {
  functionCallingConfig: {
    mode: 'AUTO' | 'NONE' | 'ANY';
    allowedFunctionNames?: string[];
  };
}

/** Gemini generation configuration. */
export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

/** Full Gemini generateContent request body. */
export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
  toolConfig?: GeminiToolConfig;
  generationConfig?: GeminiGenerationConfig;
}

// ── Translation ──────────────────────────────────────────────────────────────

/**
 * Translate a unified Request into a Gemini generateContent request body.
 */
export function translateRequest(request: Request): GeminiRequest {
  const geminiRequest: GeminiRequest = {
    contents: [],
  };

  // Separate system messages from conversation messages.
  const systemTexts: string[] = [];
  const conversationMessages: Message[] = [];

  for (const message of request.messages) {
    if (message.role === 'system') {
      systemTexts.push(extractTextFromMessage(message));
    } else {
      conversationMessages.push(message);
    }
  }

  // System instruction.
  if (systemTexts.length > 0) {
    geminiRequest.systemInstruction = {
      parts: systemTexts.map((text) => ({ text })),
    };
  }

  // Conversation contents.
  geminiRequest.contents = translateMessages(conversationMessages);

  // Tools.
  if (request.tools && request.tools.length > 0) {
    geminiRequest.tools = [
      {
        functionDeclarations: request.tools.map(translateTool),
      },
    ];
  }

  // Tool choice.
  if (request.toolChoice !== undefined) {
    geminiRequest.toolConfig = translateToolChoice(request.toolChoice);
  }

  // Generation config.
  const genConfig = buildGenerationConfig(request);
  if (Object.keys(genConfig).length > 0) {
    geminiRequest.generationConfig = genConfig;
  }

  return geminiRequest;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractTextFromMessage(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content
    .filter((part): part is TextContent => part.kind === 'text')
    .map((part) => part.text)
    .join('\n');
}

/**
 * Translate conversation messages into Gemini contents array.
 * Adjacent messages with the same role are merged (Gemini requires alternating roles).
 */
function translateMessages(messages: Message[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    const role = mapRole(message.role);
    const parts = translateContentParts(message);

    if (parts.length === 0) continue;

    // Merge with previous content if same role (Gemini requires alternating user/model).
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  return contents;
}

function mapRole(role: string): 'user' | 'model' {
  switch (role) {
    case 'assistant':
      return 'model';
    case 'tool':
      return 'user';
    case 'user':
    default:
      return 'user';
  }
}

function translateContentParts(message: Message): GeminiPart[] {
  if (typeof message.content === 'string') {
    return [{ text: message.content }];
  }

  const parts: GeminiPart[] = [];

  for (const part of message.content) {
    const translated = translateContentPart(part, message.role);
    if (translated) {
      parts.push(translated);
    }
  }

  return parts;
}

function translateContentPart(part: ContentPart, role: string): GeminiPart | undefined {
  switch (part.kind) {
    case 'text':
      return { text: (part as TextContent).text };

    case 'image': {
      const img = part as ImageContent;
      if (img.source.type === 'base64' && img.source.data) {
        return {
          inlineData: {
            mimeType: img.source.mediaType ?? 'image/png',
            data: img.source.data,
          },
        };
      }
      // URL images: Gemini supports fileData but we map to text fallback for now.
      if (img.source.url) {
        return { text: `[Image: ${img.source.url}]` };
      }
      return undefined;
    }

    case 'tool_call': {
      const tc = part as ToolCallContent;
      return {
        functionCall: {
          name: tc.toolCall.name,
          args: tc.toolCall.arguments,
        },
      };
    }

    case 'tool_result': {
      const tr = part as ToolResultContent;
      // Tool results become functionResponse parts.
      // We need the tool name, but ToolResult only has toolCallId.
      // The caller should have set this up with the correct mapping.
      // We use toolCallId as a fallback name since the actual name isn't available here.
      return {
        functionResponse: {
          name: tr.toolResult.toolCallId,
          response: {
            result: tr.toolResult.isError
              ? { error: tr.toolResult.content }
              : tr.toolResult.content,
          },
        },
      };
    }

    case 'thinking':
      // Gemini doesn't support thinking content — skip.
      return undefined;

    case 'redacted_thinking':
      return undefined;

    case 'audio':
      // Not directly supported in this mapping.
      return undefined;

    case 'document':
      // Not directly supported in this mapping.
      return undefined;

    default:
      return undefined;
  }
}

function translateTool(tool: Tool): GeminiFunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    ...(Object.keys(tool.parameters).length > 0 && { parameters: tool.parameters }),
  };
}

function translateToolChoice(toolChoice: ToolChoice): GeminiToolConfig {
  if (typeof toolChoice === 'string') {
    const modeMap: Record<string, 'AUTO' | 'NONE' | 'ANY'> = {
      auto: 'AUTO',
      none: 'NONE',
      required: 'ANY',
    };
    return {
      functionCallingConfig: {
        mode: modeMap[toolChoice] ?? 'AUTO',
      },
    };
  }

  // Specific function choice: use ANY mode with allowed function names.
  return {
    functionCallingConfig: {
      mode: 'ANY',
      allowedFunctionNames: [toolChoice.name],
    },
  };
}

function buildGenerationConfig(request: Request): GeminiGenerationConfig {
  const config: GeminiGenerationConfig = {};

  if (request.temperature !== undefined) {
    config.temperature = request.temperature;
  }
  if (request.topP !== undefined) {
    config.topP = request.topP;
  }
  if (request.maxTokens !== undefined) {
    config.maxOutputTokens = request.maxTokens;
  }
  if (request.stop && request.stop.length > 0) {
    config.stopSequences = request.stop;
  }
  if (request.responseFormat) {
    applyResponseFormat(config, request.responseFormat);
  }

  return config;
}

function applyResponseFormat(config: GeminiGenerationConfig, format: ResponseFormat): void {
  switch (format.type) {
    case 'json_object':
      config.responseMimeType = 'application/json';
      break;
    case 'json_schema':
      config.responseMimeType = 'application/json';
      if (format.schema) {
        config.responseSchema = format.schema;
      }
      break;
    case 'text':
      config.responseMimeType = 'text/plain';
      break;
  }
}
