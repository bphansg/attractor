/**
 * @attractor/agent — Anthropic Provider Profile
 *
 * Claude Code-aligned profile providing edit_file (old_string/new_string),
 * read_file, write_file, shell, grep, and glob tools with a system prompt
 * that mirrors Claude Code conventions.
 */

import type { Tool } from '@attractor/llm';
import type { ExecutionEnvironment } from '../env/interface.js';
import type { ProviderProfile } from './profile.js';
import { buildEnvironmentContext } from '../prompts/context.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const CONTEXT_WINDOW = 200_000;
const SHELL_TIMEOUT_SEC = 120;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

function anthropicTools(): Tool[] {
  return [
    {
      name: 'read_file',
      description:
        'Read the contents of a file. Returns the file content with line numbers. ' +
        'Use offset and limit to read specific portions of large files.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file to read.',
          },
          offset: {
            type: 'number',
            description: 'Line number to start reading from (1-based). Optional.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of lines to read. Optional.',
          },
        },
        required: ['file_path'],
        additionalProperties: false,
      },
    },
    {
      name: 'write_file',
      description:
        'Create a new file or overwrite an existing file with the given content. ' +
        'Prefer edit_file for modifying existing files. Use this only for new files or complete rewrites.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file to write.',
          },
          content: {
            type: 'string',
            description: 'The full content to write to the file.',
          },
        },
        required: ['file_path', 'content'],
        additionalProperties: false,
      },
    },
    {
      name: 'edit_file',
      description:
        'Make an exact string replacement in a file. The old_string must match exactly one ' +
        'location in the file. If it matches zero or multiple locations the edit will fail. ' +
        'Provide enough surrounding context in old_string to make it unique. Set replace_all ' +
        'to true to replace every occurrence.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file to edit.',
          },
          old_string: {
            type: 'string',
            description:
              'The exact string to find in the file. Must be unique unless replace_all is true.',
          },
          new_string: {
            type: 'string',
            description: 'The string to replace old_string with. Must differ from old_string.',
          },
          replace_all: {
            type: 'boolean',
            description: 'If true, replace all occurrences of old_string. Default: false.',
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
        additionalProperties: false,
      },
    },
    {
      name: 'shell',
      description:
        `Execute a shell command and return its stdout, stderr, and exit code. ` +
        `Default timeout is ${SHELL_TIMEOUT_SEC} seconds. Use for running builds, tests, ` +
        `git operations, and any task that requires shell access.`,
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute.',
          },
          timeout: {
            type: 'number',
            description: `Timeout in seconds. Default: ${SHELL_TIMEOUT_SEC}.`,
          },
          working_dir: {
            type: 'string',
            description: 'Working directory for the command. Optional.',
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
    {
      name: 'grep',
      description:
        'Search for a regex pattern in files. Returns matching lines with file paths and ' +
        'line numbers. Supports glob filtering and case-insensitive search.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regex pattern to search for.',
          },
          path: {
            type: 'string',
            description: 'The file or directory to search in. Defaults to the working directory.',
          },
          case_insensitive: {
            type: 'boolean',
            description: 'If true, perform a case-insensitive search.',
          },
          glob_filter: {
            type: 'string',
            description: 'Glob pattern to filter which files are searched (e.g. "*.ts").',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return.',
          },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
    {
      name: 'glob',
      description:
        'Find files matching a glob pattern. Returns a list of matching file paths.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The glob pattern to match (e.g. "**/*.ts", "src/**/*.test.ts").',
          },
          path: {
            type: 'string',
            description: 'The directory to search in. Defaults to the working directory.',
          },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildAnthropicSystemPrompt(
  env: ExecutionEnvironment,
  projectDocs: string[],
): string {
  const sections: string[] = [];

  sections.push(
    `You are a coding agent. You have access to tools for reading, writing, and editing files, ` +
    `running shell commands, and searching the codebase. Use these tools to accomplish the user's ` +
    `task. Be thorough and precise.`,
  );

  sections.push(
    `## Tool Usage Guidelines

- **Always read a file before editing it.** Never edit a file you have not read in this conversation.
- **Prefer edit_file over write_file** for modifying existing files. edit_file sends only the diff and is safer.
- **edit_file requires old_string to be unique** in the target file. Include enough surrounding context (a few lines before and after) to ensure uniqueness. The edit will fail if old_string matches zero or multiple locations.
- **Preserve exact indentation** when specifying old_string and new_string. Whitespace differences will cause the match to fail.
- When creating entirely new files, use write_file. When modifying existing files, use edit_file.
- Use grep and glob to search the codebase before making changes. Understand the existing code structure first.
- Use shell for running tests, builds, git commands, and other operations. The default timeout is ${SHELL_TIMEOUT_SEC}s.
- Always use absolute file paths.`,
  );

  sections.push(
    `## Coding Best Practices

- Follow the existing code style and conventions of the project.
- Write clean, readable code with appropriate comments for non-obvious logic.
- Ensure imports are correct and complete.
- Run tests after making changes when a test suite exists.
- Make minimal, focused changes. Do not refactor unrelated code.
- When fixing bugs, understand the root cause before applying a fix.`,
  );

  // Environment context
  sections.push(buildEnvironmentContext(env));

  // Project docs
  if (projectDocs.length > 0) {
    sections.push(
      `## Project Documentation\n\n` + projectDocs.join('\n\n---\n\n'),
    );
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Profile factory
// ---------------------------------------------------------------------------

export function createAnthropicProfile(
  options?: { model?: string },
): ProviderProfile {
  const model = options?.model ?? DEFAULT_MODEL;

  return {
    id: 'anthropic',
    model,
    contextWindowSize: CONTEXT_WINDOW,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsParallelToolCalls: true,

    buildSystemPrompt: buildAnthropicSystemPrompt,
    tools: anthropicTools,
    providerOptions: () => undefined,
  };
}
