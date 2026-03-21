/**
 * @attractor/agent — Gemini Provider Profile
 *
 * gemini-cli-aligned profile providing read_file, write_file, edit_file,
 * shell, grep, and glob tools with a system prompt that mirrors gemini-cli
 * conventions.
 */

import type { Tool } from '@attractor/llm';
import type { ExecutionEnvironment } from '../env/interface.js';
import type { ProviderProfile } from './profile.js';
import { buildEnvironmentContext } from '../prompts/context.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'gemini-2.5-flash';
const CONTEXT_WINDOW = 1_048_576;
const SHELL_TIMEOUT_SEC = 10;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

function geminiTools(): Tool[] {
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
        'Prefer edit_file for modifying existing files. Use this for new files or complete rewrites.',
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
        'location in the file unless replace_all is true. Include enough surrounding context ' +
        'to ensure uniqueness.',
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
              'The exact string to find. Must be unique in the file unless replace_all is true.',
          },
          new_string: {
            type: 'string',
            description: 'The string to replace old_string with.',
          },
          replace_all: {
            type: 'boolean',
            description: 'If true, replace all occurrences. Default: false.',
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
        `Default timeout is ${SHELL_TIMEOUT_SEC} seconds. Use for builds, tests, and git operations.`,
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

function buildGeminiSystemPrompt(
  env: ExecutionEnvironment,
  projectDocs: string[],
): string {
  const sections: string[] = [];

  sections.push(
    `You are a coding agent. You can read, write, and edit files, run shell commands, ` +
    `and search the codebase using grep and glob. Use these tools to accomplish the user's task.`,
  );

  sections.push(
    `## Tool Usage Guidelines

- **Read files before editing them.** Always read a file first to understand its current content.
- **Prefer edit_file for modifications.** Only use write_file for creating new files or complete rewrites.
- **edit_file uses exact string matching.** The old_string must appear exactly once in the file. Include enough surrounding lines to make it unique.
- Use grep to search for patterns and glob to find files by name. Explore the codebase before making changes.
- Shell commands have a default timeout of ${SHELL_TIMEOUT_SEC}s. Set a longer timeout for builds and tests.
- Always use absolute file paths.
- When multiple independent operations are needed, call tools in parallel for efficiency.`,
  );

  sections.push(
    `## Coding Best Practices

- Follow the existing code style and conventions of the project.
- Write clean, readable code with appropriate comments.
- Ensure imports are correct and complete.
- Run tests after making changes when a test suite exists.
- Make minimal, focused changes. Do not refactor unrelated code.
- Explain your reasoning before making changes.`,
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

export function createGeminiProfile(
  options?: { model?: string },
): ProviderProfile {
  const model = options?.model ?? DEFAULT_MODEL;

  return {
    id: 'gemini',
    model,
    contextWindowSize: CONTEXT_WINDOW,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsParallelToolCalls: true,

    buildSystemPrompt: buildGeminiSystemPrompt,
    tools: geminiTools,
    providerOptions: () => undefined,
  };
}
