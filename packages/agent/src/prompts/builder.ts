/**
 * @attractor/agent — System Prompt Builder
 *
 * Composes a complete system prompt by layering provider-specific base
 * instructions, environment context, tool descriptions, project docs,
 * and user instruction overrides.
 */

import type { ProviderProfile } from '../profiles/profile.js';
import type { ExecutionEnvironment } from '../env/interface.js';

/**
 * Build a complete system prompt by layering multiple sources of
 * instructions in a deterministic order:
 *
 * 1. **Provider base instructions** — model-specific guidance from
 *    `profile.buildSystemPrompt()`, including tool usage patterns and
 *    coding best practices.
 * 2. **Environment context** — working directory, platform, date (already
 *    included by the profile's buildSystemPrompt).
 * 3. **Tool descriptions** — a summary of available tools (already
 *    included by the profile's buildSystemPrompt and tool definitions).
 * 4. **Project documentation** — AGENTS.md, CLAUDE.md, etc. (already
 *    included by the profile's buildSystemPrompt).
 * 5. **User instruction overrides** — appended last so they take highest
 *    precedence.
 *
 * Steps 2-4 are folded into the profile's `buildSystemPrompt` call.
 * This function adds the user override layer on top.
 */
export function buildSystemPrompt(
  profile: ProviderProfile,
  env: ExecutionEnvironment,
  projectDocs: string[],
  userInstructions?: string,
): string {
  const sections: string[] = [];

  // 1-4: Provider-specific base + environment + tools + project docs
  sections.push(profile.buildSystemPrompt(env, projectDocs));

  // 5: User instruction overrides (highest precedence)
  if (userInstructions && userInstructions.trim().length > 0) {
    sections.push(
      `## User Instructions\n\n` +
      `The following instructions from the user take precedence over ` +
      `any conflicting guidance above.\n\n` +
      userInstructions.trim(),
    );
  }

  return sections.join('\n\n');
}
