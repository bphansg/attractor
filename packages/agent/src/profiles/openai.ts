/**
 * @attractor/agent — OpenAI Provider Profile
 *
 * codex-rs-aligned profile providing apply_patch (v4a unified diff format),
 * read_file, write_file (new files only), shell, grep, and glob tools with
 * a system prompt that mirrors codex-rs conventions.
 */

import type { Tool } from '@attractor/llm';
import type { ExecutionEnvironment } from '../env/interface.js';
import type { ProviderProfile } from './profile.js';
import { buildEnvironmentContext } from '../prompts/context.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'gpt-4.1';
const CONTEXT_WINDOW = 1_047_576;
const SHELL_TIMEOUT_SEC = 10;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

function openaiTools(): Tool[] {
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
        'Create a new file with the given content. Use this only for creating new files, ' +
        'not for modifying existing ones. Use apply_patch to modify existing files.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the new file to create.',
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
      name: 'apply_patch',
      description:
        'Apply a patch to one or more files using the v4a unified diff format. ' +
        'This is the primary tool for editing existing files. The patch must use the ' +
        'exact format described in the system prompt.',
      parameters: {
        type: 'object',
        properties: {
          patch: {
            type: 'string',
            description: 'The patch content in v4a unified diff format.',
          },
        },
        required: ['patch'],
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

function buildOpenAISystemPrompt(
  env: ExecutionEnvironment,
  projectDocs: string[],
): string {
  const sections: string[] = [];

  sections.push(
    `You are a coding agent. You have access to tools for reading files, applying patches, ` +
    `running shell commands, and searching the codebase. Use these tools to accomplish the ` +
    `user's task. Be precise and efficient.`,
  );

  sections.push(
    `## apply_patch Format

The apply_patch tool accepts a v4a unified diff. The format is:

\`\`\`
*** Begin Patch
*** Update File: path/to/file.ts
@@
-old line 1
-old line 2
+new line 1
+new line 2
@@
*** End Patch
\`\`\`

Rules:
- Lines prefixed with \`-\` are removed, lines prefixed with \`+\` are added, and lines prefixed with a space are context (unchanged).
- Include 3 lines of context before and after each change for accurate matching.
- Use \`*** Add File: path\` to create a new file within the patch.
- Use \`*** Delete File: path\` to remove a file.
- Multiple file changes can be included in a single patch.`,
  );

  sections.push(
    `## Tool Usage Guidelines

- **Read files before modifying them.** Understand the existing code before applying changes.
- **Use apply_patch for all edits** to existing files. Use write_file only for creating new files.
- Use grep and glob to search the codebase. Understand the project structure before making changes.
- Shell commands have a default timeout of ${SHELL_TIMEOUT_SEC}s. Set a longer timeout for builds and tests.
- Always use absolute file paths.`,
  );

  sections.push(
    `## Coding Best Practices

- Follow the existing code style and conventions of the project.
- Write clean, readable code with appropriate comments.
- Ensure imports are correct and complete.
- Run tests after making changes when a test suite exists.
- Make minimal, focused changes. Do not refactor unrelated code.`,
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

export function createOpenAIProfile(
  options?: { model?: string },
): ProviderProfile {
  const model = options?.model ?? DEFAULT_MODEL;

  return {
    id: 'openai',
    model,
    contextWindowSize: CONTEXT_WINDOW,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsParallelToolCalls: true,

    buildSystemPrompt: buildOpenAISystemPrompt,
    tools: openaiTools,
    providerOptions: () => undefined,
  };
}
