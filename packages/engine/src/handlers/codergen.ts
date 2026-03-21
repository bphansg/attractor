import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphNode } from '../graph/node.js';
import type { Graph } from '../graph/graph.js';
import type { Context } from '../state/context.js';
import type { Outcome } from '../state/outcome.js';
import { createOutcome } from '../state/outcome.js';
import type { Handler } from './interface.js';

export interface CodergenBackend {
  run(node: GraphNode, prompt: string, context: Context): Promise<string | Outcome>;
}

const MAX_RESPONSE_TRUNCATION = 2000;

export class CodergenHandler implements Handler {
  private backend: CodergenBackend;

  constructor(backend: CodergenBackend) {
    this.backend = backend;
  }

  async execute(node: GraphNode, context: Context, graph: Graph, logsRoot: string): Promise<Outcome> {
    // 1. Build prompt: node.prompt || node.label, expand $goal with graph.goal
    let prompt = node.prompt || node.label;
    prompt = prompt.replace(/\$goal/g, graph.goal);

    // 2. Write prompt to {logsRoot}/{node.id}/prompt.md
    const nodeDir = join(logsRoot, node.id);
    await mkdir(nodeDir, { recursive: true });
    await writeFile(join(nodeDir, 'prompt.md'), prompt, 'utf-8');

    // 3. Call backend
    let result: string | Outcome;
    try {
      result = await this.backend.run(node, prompt, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeFile(
        join(nodeDir, 'status.json'),
        JSON.stringify({ status: 'fail', error: message }, null, 2),
        'utf-8',
      );
      return createOutcome({
        status: 'fail',
        failureReason: message,
      });
    }

    // 4. If result is Outcome, use directly; if string, wrap in SUCCESS
    let outcome: Outcome;
    let responseText: string;

    if (typeof result === 'string') {
      responseText = result;
      outcome = createOutcome({
        status: 'success',
        contextUpdates: {
          last_stage: node.id,
          last_response: result.slice(0, MAX_RESPONSE_TRUNCATION),
        },
      });
    } else {
      responseText = result.notes || JSON.stringify(result);
      outcome = {
        ...result,
        contextUpdates: {
          last_stage: node.id,
          last_response: responseText.slice(0, MAX_RESPONSE_TRUNCATION),
          ...result.contextUpdates,
        },
      };
    }

    // 5. Write response to {logsRoot}/{node.id}/response.md
    await writeFile(join(nodeDir, 'response.md'), responseText, 'utf-8');

    // 6. Write status.json
    await writeFile(
      join(nodeDir, 'status.json'),
      JSON.stringify({ status: outcome.status, timestamp: new Date().toISOString() }, null, 2),
      'utf-8',
    );

    // 7. Return outcome
    return outcome;
  }
}
