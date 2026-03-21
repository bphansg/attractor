/**
 * @attractor/agent — Environment Context Block
 *
 * Builds a structured environment context string from the current
 * {@link ExecutionEnvironment} for inclusion in system prompts.
 */

import type { ExecutionEnvironment } from '../env/interface.js';

/**
 * Build an `<environment>` XML block describing the current execution
 * environment.  This block is included in every system prompt so the model
 * is aware of platform, working directory, and current date.
 */
export function buildEnvironmentContext(env: ExecutionEnvironment): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return [
    '<environment>',
    `Working directory: ${env.workingDirectory()}`,
    `Platform: ${env.platform()}`,
    `OS version: ${env.osVersion()}`,
    `Today's date: ${today}`,
    '</environment>',
  ].join('\n');
}
