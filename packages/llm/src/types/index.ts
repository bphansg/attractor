/**
 * @attractor/llm — Core Types
 *
 * Barrel re-export of all type definitions.
 */

// Tool types (must come before message, since message imports from tool)
export type { Tool, ToolCall, ToolResult, ToolChoice } from './tool.js';

// Message types
export type {
  Role,
  ContentKind,
  CacheControl,
  ImageSource,
  DocumentSource,
  TextContent,
  ImageContent,
  AudioContent,
  DocumentContent,
  ToolCallContent,
  ToolResultContent,
  ThinkingContent,
  RedactedThinkingContent,
  ContentPart,
} from './message.js';
export { Message } from './message.js';

// Request types
export type { Request, ResponseFormat } from './request.js';

// Response types
export type { FinishReason, Usage, Response, Warning, RateLimitInfo } from './response.js';

// Stream types
export type { StreamEventType, StreamEvent } from './stream.js';

// Error types
export {
  SDKError,
  ProviderError,
  AuthenticationError,
  RateLimitError,
  ContextLengthError,
  ContentFilterError,
  InvalidRequestError,
  ServerError,
  NetworkError,
  TimeoutError,
  ValidationError,
  ConfigurationError,
} from './errors.js';
