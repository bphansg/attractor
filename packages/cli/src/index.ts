import { runCommand } from './commands/run.js';
import { validateCommand } from './commands/validate.js';
import { serveCommand } from './commands/serve.js';

const VERSION = '0.1.0';

function showHelp(): void {
  console.log(`
attractor v${VERSION} — Pipeline runner for DOT-defined workflows

Usage:
  attractor <command> [options]

Commands:
  run <file.dot> [options]    Run a pipeline from a DOT file
  validate <file.dot>         Validate a DOT file without running
  serve [options]              Start HTTP server (coming soon)

Run options:
  --logs-dir <dir>            Directory for run logs (default: ./attractor-logs/<timestamp>)
  --auto-approve              Skip human approval gates automatically
  --model <model>             LLM model to use (e.g. claude-sonnet-4-20250514)
  --provider <provider>       LLM provider (anthropic, openai, google)

Examples:
  attractor run pipeline.dot
  attractor run pipeline.dot --auto-approve --logs-dir ./logs
  attractor validate pipeline.dot
`);
}

async function main(): Promise<void> {
  const [,, command, ...args] = process.argv;

  switch (command) {
    case 'run':
      await runCommand(args);
      break;
    case 'validate':
      await validateCommand(args);
      break;
    case 'serve':
      await serveCommand(args);
      break;
    case '--version':
    case '-v':
      console.log(`attractor v${VERSION}`);
      break;
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
