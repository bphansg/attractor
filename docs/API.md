# Attractor API Reference

This document covers the public API for all Attractor packages. For auto-generated docs with full type details, see the [TypeDoc output](./api/).

---

## Table of Contents

- [@attractor/llm — Unified LLM Client](#attractorllm)
- [@attractor/agent — Coding Agent Loop](#attractoragent)
- [@attractor/engine — Pipeline Engine](#attractorengine)
- [@attractor/cli — Command Line Interface](#attractorcli)

---

## @attractor/llm

Unified client for OpenAI, Anthropic, and Google Gemini. One interface, three providers.

```bash
npm install @attractor/llm
```

### Client

The main entry point. Routes requests to the right provider based on model name or explicit provider config.

```typescript
import { Client } from '@attractor/llm';

// Auto-detect providers from environment variables
const client = Client.fromEnv();

// Or configure manually
const client = new Client({
  providers: { anthropic: new AnthropicAdapter({ apiKey: '...' }) },
  defaultProvider: 'anthropic',
});
```

#### `Client.fromEnv(): Client`

Creates a client by reading `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY` from the environment. Only registers providers for which keys are found.

#### `client.complete(request: Request): Promise<Response>`

Send a non-streaming completion request.

```typescript
const response = await client.complete({
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(response.text);
```

#### `client.stream(request: Request): AsyncGenerator<StreamEvent>`

Stream a response as incremental events.

```typescript
for await (const event of client.stream({ model: 'gpt-4o', messages })) {
  if (event.type === 'content.delta') process.stdout.write(event.text ?? '');
}
```

#### `client.close(): Promise<void>`

Gracefully shut down all provider adapters.

---

### High-Level API

Convenience functions that wrap the client with common patterns.

#### `generate(options): Promise<Response>`

Single-shot completion with optional tool loop.

```typescript
import { generate } from '@attractor/llm';

const response = await generate({
  model: 'claude-sonnet-4-20250514',
  messages: 'Explain recursion in one sentence.',
});
```

**Options:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `model` | `string` | required | Model identifier |
| `messages` | `Message[] \| string` | required | Conversation or single message shorthand |
| `tools` | `Tool[]` | — | Tool definitions |
| `executeToolCall` | `(tc: ToolCall) => Promise<ToolResult>` | — | Tool executor (enables tool loop) |
| `maxToolRounds` | `number` | `10` | Max tool-use rounds |
| `maxTokens` | `number` | — | Max output tokens |
| `temperature` | `number` | — | Sampling temperature (0–2) |
| `reasoningEffort` | `'low' \| 'medium' \| 'high'` | — | Reasoning hint |
| `client` | `Client` | auto | Client instance |

#### `streamGenerate(options): AsyncGenerator<StreamEvent>`

Streaming version of `generate()` with the same options.

#### `generateObject<T>(options): Promise<GenerateObjectResult<T>>`

Generate structured JSON validated against a JSON Schema.

```typescript
import { generateObject } from '@attractor/llm';

const result = await generateObject({
  model: 'claude-sonnet-4-20250514',
  messages: 'List 3 colors as JSON',
  schema: {
    type: 'object',
    properties: { colors: { type: 'array', items: { type: 'string' } } },
    required: ['colors'],
  },
});
console.log(result.object.colors); // ['red', 'blue', 'green']
```

#### `runToolLoop(config): Promise<Response>`

Multi-step tool execution loop. Called internally by `generate()` when tools are provided.

---

### Types

#### `Request`

```typescript
interface Request {
  model: string;
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  reasoningEffort?: 'low' | 'medium' | 'high';
  responseFormat?: ResponseFormat;
  provider?: string;
  providerOptions?: Record<string, unknown>;
}
```

#### `Response`

```typescript
interface Response {
  id: string;
  model: string;
  text: string;                          // Primary text output
  content: ContentPart[];                // Full structured content
  toolCalls: ToolCall[];                 // Tool calls requested
  finishReason: FinishReason;            // 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error'
  usage: Usage;                          // Token statistics
  reasoning?: string;                    // Reasoning/thinking text
}
```

#### `Message`

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
}

// Convenience constructors:
Message.system('You are helpful.')
Message.user('Hello!')
Message.assistant('Hi there!')
Message.tool([{ toolCallId: '...', content: 'result' }])
Message.text(msg)  // Extract text from any message
```

#### `Tool` / `ToolCall` / `ToolResult`

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;   // JSON Schema
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}
```

#### `StreamEvent`

```typescript
interface StreamEvent {
  type: StreamEventType;
  // 'stream.start' | 'content.start' | 'content.delta' | 'content.end'
  // 'tool_call.start' | 'tool_call.delta' | 'tool_call.end'
  // 'thinking.start' | 'thinking.delta' | 'thinking.end'
  // 'stream.end'
  text?: string;
  toolCall?: Partial<ToolCall>;
  response?: Response;         // On 'stream.end'
  usage?: Usage;
  finishReason?: FinishReason;
}
```

---

### Middleware

Intercept and transform requests/responses.

```typescript
const logging: Middleware = async (request, next) => {
  console.log('Sending:', request.model);
  const response = await next(request);
  console.log('Tokens:', response.usage.totalTokens);
  return response;
};

const client = new Client({ middleware: [logging] });
```

---

### Provider Adapters

Each adapter implements the `ProviderAdapter` interface:

```typescript
interface ProviderAdapter {
  readonly name: string;
  complete(request: Request): Promise<Response>;
  stream(request: Request): AsyncGenerator<StreamEvent>;
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}
```

| Adapter | Provider | API | Key Env Var |
|---------|----------|-----|-------------|
| `OpenAIAdapter` | OpenAI | Responses API | `OPENAI_API_KEY` |
| `AnthropicAdapter` | Anthropic | Messages API | `ANTHROPIC_API_KEY` |
| `GeminiAdapter` | Google | generateContent | `GEMINI_API_KEY` |

---

### Error Types

All errors extend `SDKError`. Provider errors include `statusCode`, `retryable`, and `retryAfter`.

| Error | When |
|-------|------|
| `AuthenticationError` | Invalid or missing API key |
| `RateLimitError` | Rate limit exceeded |
| `ContextLengthError` | Input too long for model |
| `ContentFilterError` | Content safety filter triggered |
| `InvalidRequestError` | Malformed request |
| `ServerError` | Provider internal error |
| `NetworkError` | DNS, connection, or network failure |
| `TimeoutError` | Request timed out |
| `ValidationError` | Input validation failed |
| `ConfigurationError` | SDK misconfiguration |

---

## @attractor/agent

Programmable coding agent loop with provider-aligned toolsets.

```bash
npm install @attractor/agent
```

### Session

The core agentic conversation. Submits user input, calls the LLM, executes tools, and loops until done.

```typescript
import { Session, createAnthropicProfile, LocalExecutionEnvironment } from '@attractor/agent';
import { Client } from '@attractor/llm';

const session = new Session({
  client: Client.fromEnv(),
  profile: createAnthropicProfile(),
  executionEnv: new LocalExecutionEnvironment('/path/to/project'),
});

await session.submit('Fix the failing tests in src/auth.ts');
await session.close();
```

#### `session.submit(input: string): Promise<void>`

Submit user input and run the agent loop to completion.

#### `session.steer(message: string): void`

Inject a steering message into the current processing loop.

#### `session.followUp(message: string): void`

Queue a follow-up message for after the current loop finishes.

#### `session.abort(): void`

Abort the current processing.

#### `session.close(): Promise<void>`

Close the session and clean up resources.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Session identifier |
| `state` | `SessionState` | `'idle' \| 'processing' \| 'awaiting_input' \| 'closed'` |
| `history` | `Turn[]` | Conversation turn history |

---

### SessionConfig

```typescript
interface SessionConfig {
  maxTurns: number;                    // 0 = unlimited
  maxToolRoundsPerInput: number;       // 0 = unlimited
  defaultCommandTimeoutMs: number;     // Default: 120000 (Anthropic), 10000 (OpenAI)
  maxCommandTimeoutMs: number;         // Hard ceiling
  reasoningEffort: 'low' | 'medium' | 'high' | null;
  toolOutputLimits: Record<string, number>;  // Per-tool char limits
  toolLineLimits: Record<string, number>;    // Per-tool line limits
  enableLoopDetection: boolean;        // Default: true
  loopDetectionWindow: number;         // Default: 10
  maxSubagentDepth: number;            // Default: 3
}
```

---

### Provider Profiles

Pre-configured tool sets and prompts aligned to each provider's native agent.

```typescript
import { createAnthropicProfile, createOpenAIProfile, createGeminiProfile } from '@attractor/agent';
```

| Factory | Default Model | Tools | Style |
|---------|---------------|-------|-------|
| `createAnthropicProfile()` | `claude-sonnet-4-20250514` | read_file, write_file, edit_file, shell, grep, glob | Claude Code-aligned |
| `createOpenAIProfile()` | `gpt-4.1` | read_file, write_file, apply_patch, shell, grep, glob | codex-rs-aligned |
| `createGeminiProfile()` | `gemini-2.5-flash` | read_file, write_file, edit_file, shell, grep, glob | gemini-cli-aligned |

---

### ExecutionEnvironment

Abstraction for file system and command execution. Ships with `LocalExecutionEnvironment` for Node.js.

```typescript
interface ExecutionEnvironment {
  readFile(path: string, offset?: number, limit?: number): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listDirectory(path: string, depth?: number): Promise<DirEntry[]>;
  execCommand(cmd: string, timeoutMs: number, cwd?: string, env?: Record<string, string>): Promise<ExecResult>;
  grep(pattern: string, path: string, options?: GrepOptions): Promise<string>;
  glob(pattern: string, basePath: string): Promise<string[]>;
  workingDirectory(): string;
  platform(): string;
}
```

---

### Events

Subscribe to session lifecycle events.

```typescript
const unsub = session.eventEmitter.on((event) => {
  console.log(event.kind, event.data);
});

// Event kinds:
// session.start, session.end, user.input, processing.end,
// assistant.text.start, assistant.text.delta, assistant.text.end,
// tool_call.start, tool_call.output.delta, tool_call.end,
// steering.injected, turn.limit, loop.detection, warning, error
```

---

## @attractor/engine

DOT-based pipeline execution engine. Parse, validate, and run AI workflows.

```bash
npm install @attractor/engine
```

### Quick Start

```typescript
import { parseDot, buildGraph, validate, run, createDefaultRegistry } from '@attractor/engine';

const dot = `
  digraph example {
    goal = "Say hello"
    start [shape=Mdiamond]
    greet [prompt="Say hello"]
    done  [shape=Msquare]
    start -> greet -> done
  }
`;

const ast = parseDot(dot);
const graph = buildGraph(ast);
const diagnostics = validate(graph);
const outcome = await run(graph, {
  logsRoot: './logs',
  handlerRegistry: createDefaultRegistry(),
});
```

---

### Parser

#### `parseDot(source: string): ASTGraph`

Parse a DOT string into an abstract syntax tree. Throws `ParseError` on invalid syntax.

#### `buildGraph(ast: ASTGraph): Graph`

Convert an AST into a `Graph` with resolved node types, expanded chained edges, and flattened subgraphs. Shape-to-type mapping:

| Shape | Node Type |
|-------|-----------|
| `Mdiamond` | `start` |
| `Msquare` | `exit` |
| `box` (default) | `codergen` |
| `diamond` | `conditional` |
| `hexagon` | `wait.human` |
| `parallelogram` | `tool` |
| `component` | `parallel` |
| `tripleoctagon` | `parallel.fan_in` |
| `house` | `stack.manager_loop` |

---

### Graph

```typescript
class Graph {
  readonly id: string;
  readonly nodes: Map<string, GraphNode>;
  readonly edges: GraphEdge[];
  readonly goal: string;

  getNode(id: string): GraphNode | undefined;
  outgoingEdges(nodeId: string): GraphEdge[];
  incomingEdges(nodeId: string): GraphEdge[];
  findStartNode(): GraphNode | undefined;
  findExitNode(): GraphNode | undefined;
}
```

#### `GraphNode`

```typescript
interface GraphNode {
  id: string;
  label: string;
  shape: string;
  nodeType: string;
  prompt: string;
  maxRetries: number;
  goalGate: boolean;
  retryTarget: string;
  fidelity: string;
  llmModel: string;
  llmProvider: string;
  reasoningEffort: string;
  attrs: Record<string, string>;
}
```

#### `GraphEdge`

```typescript
interface GraphEdge {
  from: string;
  to: string;
  label: string;
  condition: string;
  weight: number;
}
```

---

### Running Pipelines

#### `run(graph, config): Promise<Outcome>`

Execute a pipeline from start to end.

```typescript
interface RunConfig {
  logsRoot: string;
  handlerRegistry: HandlerRegistry;
  interviewer?: Interviewer;
  codergenBackend?: CodergenBackend;
  onEvent?: (event: PipelineEvent) => void;
}
```

#### `resumeFromCheckpoint(graph, config, checkpoint): Promise<Outcome>`

Resume a pipeline from a saved checkpoint.

#### Pipeline Events

Subscribe via `onEvent` in `RunConfig`:

| Event Type | Data | When |
|------------|------|------|
| `pipeline:start` | `graphId` | Pipeline begins |
| `pipeline:end` | `outcome` | Pipeline finishes |
| `node:enter` | `node` | Node execution starts |
| `node:exit` | `node, outcome` | Node execution ends |
| `edge:traverse` | `from, to, label` | Edge is followed |
| `retry` | `node, attempt` | Node is retried |
| `goal-gate:fail` | `node, retryTarget` | Goal gate check fails |
| `checkpoint:saved` | `currentNode` | Checkpoint is written |

---

### Handlers

#### `createDefaultRegistry(backend?): HandlerRegistry`

Creates a registry with all built-in handlers. Optionally pass a `CodergenBackend` for AI nodes.

#### `CodergenBackend`

```typescript
interface CodergenBackend {
  run(node: GraphNode, prompt: string, context: Context): Promise<string | Outcome>;
}
```

#### `HandlerRegistry`

```typescript
class HandlerRegistry {
  register(type: string, handler: Handler): void;
  get(type: string): Handler | undefined;
  resolve(node: GraphNode): Handler;
}
```

#### `Handler`

```typescript
interface Handler {
  execute(node: GraphNode, context: Context, graph: Graph, logsRoot: string): Promise<Outcome>;
}
```

---

### Validation

#### `validate(graph, extraRules?): Diagnostic[]`

Run all lint rules and return diagnostics.

#### `validateOrRaise(graph, extraRules?): void`

Same as `validate()` but throws `ValidationError` if any errors are found.

#### Built-in Rules

| Rule | Checks |
|------|--------|
| `start-node` | Exactly one start node exists |
| `terminal-node` | Exactly one exit node exists |
| `reachability` | All nodes reachable from start |
| `edge-target-exists` | All edge targets exist |
| `start-no-incoming` | Start has no incoming edges |
| `exit-no-outgoing` | Exit has no outgoing edges |
| `condition-syntax` | Edge conditions are valid |
| `type-known` | Node types and shapes are recognized |
| `fidelity-valid` | Fidelity values are valid |
| `retry-target-exists` | Retry targets reference real nodes |
| `goal-gate-has-retry` | Goal gates have retry targets |
| `prompt-on-llm-nodes` | LLM nodes have prompts |

---

### Conditions

#### `evaluateCondition(condition, outcome, context): boolean`

Evaluate an edge condition against the current outcome and context.

```
outcome=success              // Previous step succeeded
outcome!=success             // Previous step failed
preferred_label=approved     // Human picked "approved"
context.tests_passed=true    // Custom context variable
outcome=success && context.x=1  // AND — both must be true
```

---

### Context

Mutable key-value store shared across pipeline nodes.

```typescript
class Context {
  set(key: string, value: unknown): void;
  get(key: string, defaultValue?: unknown): unknown;
  getString(key: string, defaultValue?: string): string;
  getNumber(key: string, defaultValue?: number): number;
  getBoolean(key: string, defaultValue?: boolean): boolean;
  has(key: string): boolean;
  delete(key: string): void;
  snapshot(): Record<string, unknown>;
  clone(): Context;
  applyUpdates(updates: Record<string, unknown>): void;
}
```

---

### Outcome

```typescript
interface Outcome {
  status: 'success' | 'partial_success' | 'retry' | 'fail' | 'skipped';
  preferredLabel: string;
  suggestedNextIds: string[];
  contextUpdates: Record<string, unknown>;
  notes: string;
  failureReason: string;
}
```

---

### Interviewer

Human-in-the-loop interface for approval gates.

```typescript
interface Interviewer {
  ask(question: Question): Promise<Answer>;
  askMultiple(questions: Question[]): Promise<Answer[]>;
  inform(message: string, stage: string): void;
}
```

Built-in implementations:

| Class | Use Case |
|-------|----------|
| `AutoApproveInterviewer` | Always approves (CI/automation) |
| `ConsoleInterviewer` | Terminal prompts |
| `CallbackInterviewer` | Custom callback function |
| `QueueInterviewer` | Pre-loaded answer queue |
| `RecordingInterviewer` | Records answers for replay |
| `HttpInterviewer` | HTTP server (waits for POST /answer) |

---

### Generate from Natural Language

#### `generateDot(options): Promise<GenerateDotResult>`

Generate a DOT pipeline from a plain English description using an LLM.

```typescript
import { generateDot } from '@attractor/engine';

const result = await generateDot({
  description: 'Run tests, fix failures, then report results',
});
console.log(result.dot);
console.log(result.diagnostics); // validation warnings/errors
```

**Options:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `description` | `string` | required | Natural language pipeline description |
| `client` | `Client` | `Client.fromEnv()` | LLM client |
| `model` | `string` | `claude-sonnet-4-20250514` | Model to use |
| `validateOutput` | `boolean` | `true` | Validate and retry once on error |

---

### Model Stylesheet

CSS-like syntax for per-node LLM configuration.

```dot
graph [
  model_stylesheet = "
    *            { llm_model: \"claude-sonnet-4-20250514\"; }
    .fast        { llm_model: \"gemini-2.5-flash\"; reasoning_effort: \"low\"; }
    #deep_review { llm_model: \"claude-opus-4-20250514\"; reasoning_effort: \"high\"; }
  "
]
```

Selectors (by specificity): `*` (universal) < shape < `.class` < `#id`

Properties: `llm_model`, `llm_provider`, `reasoning_effort`

---

### HTTP Server

Run Attractor as a REST API server.

#### `createServer(config?): { start(), stop(), runs }`

```typescript
import { createServer } from '@attractor/engine';

const server = createServer({ port: 3000, host: '0.0.0.0' });
await server.start();
// ... later
await server.stop();
```

**ServerConfig:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `port` | `number` | `3000` | Server port |
| `host` | `string` | `'0.0.0.0'` | Bind address |
| `logsRoot` | `string` | OS temp dir | Root directory for run logs |

#### Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/pipelines/run` | `{ dot, autoApprove? }` | Start pipeline, returns `{ id, status }` |
| `POST` | `/api/v1/pipelines/validate` | `{ dot }` | Validate DOT, returns `{ valid, diagnostics }` |
| `POST` | `/api/v1/pipelines/generate` | `{ description, model? }` | Generate DOT from text, returns `{ dot, diagnostics }` |
| `GET` | `/api/v1/pipelines/:id` | — | Get run status, events, outcome, pendingQuestion |
| `GET` | `/api/v1/pipelines/:id/events` | — | SSE stream (replays past events, then live) |
| `POST` | `/api/v1/pipelines/:id/answer` | `{ value, text? }` | Answer a human gate question |
| `DELETE` | `/api/v1/pipelines/:id` | — | Abort a running pipeline |
| `GET` | `/api/v1/health` | — | `{ status, version, activePipelines }` |

#### SSE Events

The `/events` endpoint streams these event types:

| Type | When |
|------|------|
| `pipeline:start` | Pipeline begins |
| `node:enter` | Node execution starts |
| `node:exit` | Node execution ends |
| `edge:traverse` | Edge is followed |
| `retry` | Node is retried |
| `question` | Human gate waiting for answer |
| `inform` | Informational message |
| `pipeline:done` | Pipeline completed |
| `pipeline:error` | Pipeline failed |

#### PipelineRun

```typescript
interface PipelineRun {
  id: string;
  status: 'pending' | 'running' | 'waiting_human' | 'completed' | 'failed' | 'aborted';
  events: Array<Record<string, unknown>>;
  outcome?: Record<string, unknown>;
  pendingQuestion?: Question;
  sseListeners: Set<(data: string) => void>;
}
```

---

## @attractor/cli

Command-line interface for running Attractor pipelines.

### Commands

```bash
# Run a pipeline
attractor run <file.dot> [options]

# Validate a pipeline
attractor validate <file.dot>

# Generate a pipeline from natural language
attractor generate "<description>" [--output file.dot] [--model model-name]

# Start HTTP server
attractor serve [--port 3000]
```

### Run Options

| Flag | Description |
|------|-------------|
| `--logs-dir <dir>` | Directory for run logs (default: `./attractor-logs/<timestamp>`) |
| `--auto-approve` | Skip human approval gates |
| `--model <model>` | LLM model to use |
| `--provider <name>` | LLM provider (`anthropic`, `openai`, `google`) |

### Generate Options

| Flag | Description |
|------|-------------|
| `--output <file>` | Write generated DOT to a file (default: stdout) |
| `--model <model>` | LLM model to use for generation |

### Serve Options

| Flag | Description |
|------|-------------|
| `--port <port>` | Server port (default: `3000`) |
