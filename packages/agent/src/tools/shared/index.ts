/**
 * @attractor/agent — Shared Tools
 *
 * Re-exports all shared tool definitions and provides a convenience function
 * to retrieve the full set.
 */

import type { RegisteredTool } from '../registry.js';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { shellTool } from './shell.js';
import { grepTool } from './grep.js';
import { globTool } from './glob.js';

export { readFileTool } from './read-file.js';
export { writeFileTool } from './write-file.js';
export { editFileTool } from './edit-file.js';
export { shellTool } from './shell.js';
export { grepTool } from './grep.js';
export { globTool } from './glob.js';

/** Returns all shared tools as an array. */
export function getSharedTools(): RegisteredTool[] {
  return [readFileTool, writeFileTool, editFileTool, shellTool, grepTool, globTool];
}
