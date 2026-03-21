import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseDot, buildGraph, validate } from '@attractor/engine';
import type { Diagnostic } from '@attractor/engine';

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const d of diagnostics) {
    const color =
      d.severity === 'error'
        ? '\x1b[31m'
        : d.severity === 'warning'
          ? '\x1b[33m'
          : '\x1b[34m';
    const reset = '\x1b[0m';
    const location = d.nodeId
      ? ` (node: ${d.nodeId})`
      : d.edge
        ? ` (edge: ${d.edge.from} -> ${d.edge.to})`
        : '';

    console.log(`${color}[${d.severity}]${reset} ${d.rule}${location}: ${d.message}`);
    if (d.fix) {
      console.log(`         fix: ${d.fix}`);
    }
  }
}

export async function validateCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error('Error: no .dot file specified');
    console.error('Usage: attractor validate <file.dot>');
    process.exit(1);
  }

  const filePath = resolve(args[0]);

  // Read DOT file
  let source: string;
  try {
    source = await readFile(filePath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error reading file: ${message}`);
    process.exit(1);
  }

  // Parse
  let ast;
  try {
    ast = parseDot(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31mParse error:\x1b[0m ${message}`);
    process.exit(1);
  }

  // Build graph
  const graph = buildGraph(ast);

  // Validate
  const diagnostics = validate(graph);

  if (diagnostics.length === 0) {
    console.log(`\x1b[32mNo issues found.\x1b[0m ${filePath}`);
    process.exit(0);
  }

  // Group by severity
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  const infos = diagnostics.filter((d) => d.severity === 'info');

  console.log(`\nValidation results for: ${filePath}\n`);
  printDiagnostics(diagnostics);

  console.log('');
  const parts: string[] = [];
  if (errors.length > 0) parts.push(`\x1b[31m${errors.length} error(s)\x1b[0m`);
  if (warnings.length > 0) parts.push(`\x1b[33m${warnings.length} warning(s)\x1b[0m`);
  if (infos.length > 0) parts.push(`\x1b[34m${infos.length} info(s)\x1b[0m`);
  console.log(`Summary: ${parts.join(', ')}`);

  process.exit(errors.length > 0 ? 1 : 0);
}
