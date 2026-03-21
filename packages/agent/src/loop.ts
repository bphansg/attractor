/**
 * @attractor/agent — Core Agentic Loop
 *
 * Implements the iterative tool-use loop: submit user input, call the LLM,
 * execute any requested tool calls, feed results back, and repeat until the
 * model produces a natural text completion or a limit is hit.
 */

import type {
  Message,
  Request as LLMRequest,
  ToolCall,
  ToolResult,
} from '@attractor/llm';
import type {
  Session,
  Turn,
  UserTurn,
  AssistantTurn,
  ToolResultsTurn,
  SteeringTurn,
} from './session.js';
import { truncateToolOutput } from './truncation.js';
import { detectLoop } from './loop-detection.js';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Process a single user input through the full agentic loop.
 *
 * 1. Append a UserTurn to the session history.
 * 2. Drain the steering queue.
 * 3. Loop: build request -> call LLM -> handle tool calls -> repeat.
 * 4. Process any queued follow-up messages.
 * 5. Return control to the caller.
 */
export async function processInput(
  session: Session,
  input: string,
): Promise<void> {
  // 1. Record user turn
  const userTurn: UserTurn = {
    type: 'user',
    content: input,
    timestamp: new Date(),
  };
  session.history.push(userTurn);

  // 2. Drain steering queue before entering the loop
  drainSteering(session);

  // 3. Agentic loop
  let roundCount = 0;

  while (true) {
    // a. Check round limit
    if (
      session.config.maxToolRoundsPerInput > 0 &&
      roundCount >= session.config.maxToolRoundsPerInput
    ) {
      session.eventEmitter.emit('turn.limit', session.id, {
        reason: 'max_tool_rounds',
        roundCount,
      });
      break;
    }

    // Check turn limit
    if (
      session.config.maxTurns > 0 &&
      countTurns(session) >= session.config.maxTurns
    ) {
      session.eventEmitter.emit('turn.limit', session.id, {
        reason: 'max_turns',
        turnCount: countTurns(session),
      });
      break;
    }

    // b. Check abort signal
    if (session.abortController.signal.aborted) {
      break;
    }

    // c. Build LLM request
    const systemPrompt = session.providerProfile.buildSystemPrompt(
      session.executionEnv,
      [], // projectDocs — not yet wired
    );

    const messages = convertHistoryToMessages(session.history);
    const tools = session.providerProfile.tools();
    const providerOptions = session.providerProfile.providerOptions();

    const request: LLMRequest = {
      model: session.providerProfile.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: tools.length > 0 ? tools : undefined,
      ...(session.config.reasoningEffort != null
        ? { reasoningEffort: session.config.reasoningEffort }
        : {}),
      ...(providerOptions ? { providerOptions } : {}),
    };

    // d. Call LLM
    session.eventEmitter.emit('assistant.text.start', session.id);

    let response;
    try {
      response = await session.llmClient.complete(request);
    } catch (error) {
      session.eventEmitter.emit('error', session.id, {
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }

    session.eventEmitter.emit('assistant.text.end', session.id, {
      text: response.text,
    });

    // e. Record AssistantTurn
    const assistantTurn: AssistantTurn = {
      type: 'assistant',
      content: response.text,
      toolCalls: response.toolCalls,
      reasoning: response.reasoning ?? null,
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      },
      responseId: response.id ?? null,
      timestamp: new Date(),
    };
    session.history.push(assistantTurn);

    // f. If no tool calls → natural completion, break
    if (response.toolCalls.length === 0) {
      break;
    }

    // g. Execute tool calls
    const toolResults = await executeToolCalls(session, response.toolCalls);

    // h. Record ToolResultsTurn
    const toolResultsTurn: ToolResultsTurn = {
      type: 'tool_results',
      results: toolResults,
      timestamp: new Date(),
    };
    session.history.push(toolResultsTurn);

    // i. Drain steering queue
    drainSteering(session);

    // j. Loop detection check
    if (session.config.enableLoopDetection) {
      if (detectLoop(session.history, session.config.loopDetectionWindow)) {
        session.eventEmitter.emit('loop.detection', session.id, {
          windowSize: session.config.loopDetectionWindow,
        });
        break;
      }
    }

    // k. Increment round count
    roundCount++;
  }

  // 4. Process follow-up queue
  const followups = session.followupQueue.splice(0);
  for (const followup of followups) {
    if (session.abortController.signal.aborted) {
      break;
    }
    await processInput(session, followup);
  }
}

// ---------------------------------------------------------------------------
// Steering
// ---------------------------------------------------------------------------

/**
 * Drain the steering queue, appending each queued message as a SteeringTurn
 * in the session history.
 */
function drainSteering(session: Session): void {
  const messages = session.steeringQueue.splice(0);
  for (const content of messages) {
    const steeringTurn: SteeringTurn = {
      type: 'steering',
      content,
      timestamp: new Date(),
    };
    session.history.push(steeringTurn);
    session.eventEmitter.emit('steering.injected', session.id, { content });
  }
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

/**
 * Execute all tool calls in parallel and return their results.
 */
async function executeToolCalls(
  session: Session,
  toolCalls: ToolCall[],
): Promise<ToolResult[]> {
  const results = await Promise.all(
    toolCalls.map((tc) => executeSingleTool(session, tc)),
  );
  return results;
}

/**
 * Execute a single tool call and return its result.
 *
 * This is currently a stub that dispatches to the execution environment based
 * on tool name.  A full tool registry will replace this in a future iteration.
 */
async function executeSingleTool(
  session: Session,
  toolCall: ToolCall,
): Promise<ToolResult> {
  session.eventEmitter.emit('tool_call.start', session.id, {
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    arguments: toolCall.arguments,
  });

  let content: string;
  let isError = false;

  try {
    content = await dispatchToolCall(session, toolCall);
  } catch (error) {
    content = error instanceof Error ? error.message : String(error);
    isError = true;
  }

  // Apply truncation
  content = truncateToolOutput(content, toolCall.name, session.config);

  session.eventEmitter.emit('tool_call.end', session.id, {
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    isError,
  });

  return {
    toolCallId: toolCall.id,
    content,
    isError,
  };
}

/**
 * Dispatch a tool call to the appropriate execution environment method.
 *
 * This provides a minimal built-in mapping for core tools.  A pluggable
 * tool registry will be introduced in a future iteration.
 */
async function dispatchToolCall(
  session: Session,
  toolCall: ToolCall,
): Promise<string> {
  const env = session.executionEnv;
  const args = toolCall.arguments;

  switch (toolCall.name) {
    case 'read_file': {
      const path = args['path'] as string;
      const offset = args['offset'] as number | undefined;
      const limit = args['limit'] as number | undefined;
      return env.readFile(path, offset, limit);
    }

    case 'write_file': {
      const path = args['path'] as string;
      const content = args['content'] as string;
      await env.writeFile(path, content);
      return 'File written successfully.';
    }

    case 'shell': {
      const command = args['command'] as string;
      const timeoutMs =
        (args['timeout'] as number | undefined) ??
        session.config.defaultCommandTimeoutMs;
      const clampedTimeout = Math.min(
        timeoutMs,
        session.config.maxCommandTimeoutMs,
      );
      const workingDir = args['working_dir'] as string | undefined;
      const result = await env.execCommand(
        command,
        clampedTimeout,
        workingDir,
      );

      let output = result.stdout;
      if (result.stderr) {
        output += (output ? '\n' : '') + result.stderr;
      }
      if (result.timedOut) {
        output += '\n[Command timed out]';
      }
      if (result.exitCode !== 0) {
        output += `\n[Exit code: ${result.exitCode}]`;
      }
      return output;
    }

    case 'grep': {
      const pattern = args['pattern'] as string;
      const path = args['path'] as string;
      const options = {
        caseInsensitive: args['case_insensitive'] as boolean | undefined,
        maxResults: args['max_results'] as number | undefined,
        globFilter: args['glob_filter'] as string | undefined,
      };
      return env.grep(pattern, path, options);
    }

    case 'glob': {
      const pattern = args['pattern'] as string;
      const path = args['path'] as string;
      const matches = await env.glob(pattern, path);
      return matches.join('\n');
    }

    case 'edit_file': {
      // edit_file requires a more complex implementation (find & replace, etc.)
      // For now we treat it as a write if 'content' is provided.
      const path = args['path'] as string;
      const content = args['content'] as string | undefined;
      if (content !== undefined) {
        await env.writeFile(path, content);
        return 'File updated successfully.';
      }
      return 'Error: edit_file requires content argument.';
    }

    default:
      return `Error: Unknown tool "${toolCall.name}".`;
  }
}

// ---------------------------------------------------------------------------
// History conversion
// ---------------------------------------------------------------------------

/**
 * Convert the session's turn history into the LLM message format expected by
 * the client.
 */
function convertHistoryToMessages(history: Turn[]): Message[] {
  const messages: Message[] = [];

  for (const turn of history) {
    switch (turn.type) {
      case 'user':
        messages.push({ role: 'user', content: turn.content });
        break;

      case 'assistant': {
        const parts: Array<
          | { kind: 'text'; text: string }
          | { kind: 'thinking'; text: string }
          | { kind: 'tool_call'; toolCall: ToolCall }
        > = [];

        if (turn.reasoning) {
          parts.push({ kind: 'thinking', text: turn.reasoning });
        }
        if (turn.content) {
          parts.push({ kind: 'text', text: turn.content });
        }
        for (const tc of turn.toolCalls) {
          parts.push({ kind: 'tool_call', toolCall: tc });
        }

        messages.push({
          role: 'assistant',
          content: parts.length > 0 ? parts : turn.content,
        });
        break;
      }

      case 'tool_results':
        messages.push({
          role: 'tool',
          content: turn.results.map((r) => ({
            kind: 'tool_result' as const,
            toolResult: r,
          })),
        });
        break;

      case 'system':
        messages.push({ role: 'user', content: `[System] ${turn.content}` });
        break;

      case 'steering':
        messages.push({ role: 'user', content: `[Steering] ${turn.content}` });
        break;
    }
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Turn counting
// ---------------------------------------------------------------------------

/**
 * Count the number of user turns in the session history.
 */
function countTurns(session: Session): number {
  return session.history.filter((t) => t.type === 'user').length;
}
