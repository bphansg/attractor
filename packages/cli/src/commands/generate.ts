import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateDot } from '@attractor/engine';

export async function generateCommand(args: string[]): Promise<void> {
  // Parse flags
  let description = '';
  let outputFile = '';
  let model = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputFile = args[++i] ?? '';
    } else if (args[i] === '--model') {
      model = args[++i] ?? '';
    } else if (!args[i].startsWith('-')) {
      description = args[i];
    }
  }

  if (!description) {
    console.error('Error: no description provided');
    console.error('Usage: attractor generate "<description>" [--output file.dot] [--model model-name]');
    process.exit(1);
  }

  console.log('\x1b[36mGenerating pipeline from description...\x1b[0m');

  const result = await generateDot({
    description,
    ...(model ? { model } : {}),
  });

  // Print warnings/errors
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning');

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.error(`\x1b[33m[warning]\x1b[0m ${w.message}`);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`\x1b[31m[error]\x1b[0m ${e.message}`);
    }
    console.error('\n\x1b[31mGenerated DOT has validation errors. Output may need manual fixes.\x1b[0m');
  }

  // Output
  if (outputFile) {
    const outPath = resolve(outputFile);
    await writeFile(outPath, result.dot + '\n', 'utf-8');
    console.log(`\x1b[32mPipeline written to:\x1b[0m ${outPath}`);
  } else {
    console.log('\n' + result.dot);
  }
}
