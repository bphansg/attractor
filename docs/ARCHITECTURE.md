# Attractor Architecture

This document describes the internal architecture of Attractor — a DOT-based pipeline runner for orchestrating multi-stage AI workflows.

## Package Architecture

Attractor is built as a pnpm monorepo with four layered packages. Each package can be used independently.

![Package Architecture](diagrams/package-architecture.svg)

| Package | Purpose | Dependencies |
|---------|---------|-------------|
| `@attractor/llm` | Unified multi-provider LLM client (OpenAI, Anthropic, Gemini) | None |
| `@attractor/agent` | Coding agent loop with provider-aligned tools | `@attractor/llm` |
| `@attractor/engine` | Pipeline engine — DOT parser, execution, node handlers, HTTP server | `@attractor/llm`, `@attractor/agent` |
| `@attractor/cli` | Command-line interface | `@attractor/engine` |

### Dependency Direction

Dependencies flow strictly downward: CLI depends on Engine, Engine depends on Agent and LLM, Agent depends on LLM. There are no circular dependencies.

## Engine Internals

The engine is the core of Attractor. It handles the full pipeline lifecycle.

![Engine Internals](diagrams/engine-internals.svg)

### Pipeline Lifecycle

1. **PARSE** — The DOT source text is tokenized by the lexer and parsed into an AST (Abstract Syntax Tree) by a recursive descent parser.

2. **BUILD GRAPH** — The AST is transformed into a Graph model. Subgraphs are flattened, chained edges (A -> B -> C) are expanded into individual edges, and default attributes are applied.

3. **VALIDATE** — 13 lint rules check the graph for structural correctness:
   - Every pipeline must have exactly one `start` (Mdiamond) and at least one `exit` (Msquare) node
   - All edge targets must exist
   - All nodes must be reachable from start
   - LLM task nodes must have a `prompt` attribute
   - Fan-in nodes must follow parallel nodes
   - Goal gates must have valid retry targets
   - Condition syntax must be valid

4. **TRANSFORM** — Variable expansion (`$goal`), stylesheet application (CSS-like model selection), and custom transforms are applied to the graph.

5. **EXECUTE** — The runner walks the graph from the start node:
   - At each node, it dispatches to the appropriate handler based on node type
   - The handler returns an Outcome (success, fail, retry, partial_success, skipped)
   - The edge selection algorithm picks the next node using a 5-step priority system
   - On failure: fail edges → retry_target → fallback → terminate
   - Goal gates are checked before allowing exit

6. **FINALIZE** — Results are written to the log directory, checkpoints are saved, and the final outcome is returned.

### Node Handlers

| Handler | Shape | What It Does |
|---------|-------|-------------|
| Start | `Mdiamond` | No-op entry point |
| Exit | `Msquare` | No-op exit point |
| Codergen | `box` | Sends prompt to LLM via CodergenBackend |
| Conditional | `diamond` | No-op; routing handled by engine edge selection |
| Human Gate | `hexagon` | Pauses execution, asks human via Interviewer interface |
| Parallel | `component` | Fans out to multiple nodes, clones context, applies join policy |
| Fan-In | `tripleoctagon` | Consolidates parallel results (heuristic or LLM ranking) |
| Tool | `parallelogram` | Executes a shell command |
| Manager Loop | `house` | Supervisor pattern: observe/guard/steer cycles |

### Edge Selection Algorithm

When multiple edges leave a node, the engine picks the next node using this priority:

1. Evaluate all edge conditions against the current outcome and context
2. Among matching edges, prefer those with `preferred_label` matching human input
3. Among remaining candidates, pick the highest `weight`
4. If still tied, pick the first edge in source order
5. If no edges match, check for failure routing (fail edges, retry targets, fallback)

## Data Flow

![Data Flow](diagrams/data-flow.svg)

### Input Processing

- **CLI path**: User provides a `.dot` file → parsed directly
- **HTTP path**: Client POSTs DOT source or natural language → server handles auth, validation, and routing
- **NL generation**: Natural language description → LLM generates DOT → auto-validated → retry once on error

### Execution Data

- **Context**: Key-value store that accumulates data across nodes. Each node can read from and write to context.
- **Outcomes**: Each node produces an outcome with status, notes, and optional context updates.
- **Checkpoints**: Periodic snapshots of execution state for resume capability.
- **Artifacts**: Large data objects stored in memory (< 100KB) or on disk (>= 100KB).

### External Integrations

- **LLM Providers**: OpenAI, Anthropic, and Gemini are supported through `@attractor/llm` with a unified interface, middleware chain, and retry policies.
- **Human Interaction**: Three interviewer implementations — console (terminal), HTTP (REST API), and auto-approve (CI mode).
- **Outputs**: Log directories with per-stage files (prompt.md, response.md, status.json), SSE event streams, checkpoint files, and artifacts.

## Pipeline Execution Flow

![Pipeline Execution Flow](diagrams/pipeline-flow.svg)

This diagram shows a typical pipeline with branching, human gates, and retry loops. The key patterns are:

- **Linear flow**: start → analyze → test (sequential LLM tasks)
- **Conditional branching**: gate evaluates conditions to pick success or failure path
- **Human gate**: review node pauses for human approval, routes to ship or fix
- **Retry loop**: fix node loops back to test for re-evaluation

## Security Architecture

Attractor implements defense-in-depth across all layers:

- **Path traversal protection**: All file paths are sanitized and verified to be contained within their base directory
- **Environment variable filtering**: 30+ patterns block sensitive vars (API keys, tokens, secrets) from leaking to child processes
- **HTTP server hardening**: API key auth, body size limits (1MB), CORS controls, bind to localhost by default, tool node blocking, concurrent run caps, event buffer limits
- **Command execution**: Timeout caps (5 min max), output buffer limits (5MB), process group killing
- **Artifact store**: ID sanitization and path containment checks

## CI/CD Pipeline

Automated CI runs on every push and pull request via GitHub Actions:

- **Lint & Test**: Runs on Node.js 20 and 22 — installs dependencies, builds all packages, runs vitest
- **Type Check**: Runs `tsc --noEmit` across all packages to catch type errors

## Test Coverage

112 tests across 16 test files covering all three main packages:

| Package | Test Files | Tests | Areas Covered |
|---------|-----------|-------|---------------|
| `@attractor/llm` | 3 | ~15 | Middleware chain, retry policies, message construction |
| `@attractor/agent` | 3 | ~20 | Output truncation, loop detection, env variable filtering |
| `@attractor/engine` | 10 | ~77 | Parser, graph builder, conditions, validator, context, stylesheet, runner, run-dir, generate-dot, server |
