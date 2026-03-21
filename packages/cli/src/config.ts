import { join } from 'node:path';

export interface CLIConfig {
  logsDir: string;
  autoApprove: boolean;
  model?: string;
  provider?: string;
}

export interface ParsedArgs {
  dotFile: string;
  config: CLIConfig;
}

/**
 * Parse CLI arguments into a dot file path and config.
 * Supports: --logs-dir <dir>, --auto-approve, --model <model>, --provider <provider>
 */
export function parseArgs(args: string[]): ParsedArgs {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const config: CLIConfig = {
    logsDir: join(process.cwd(), 'attractor-logs', timestamp),
    autoApprove: false,
  };

  let dotFile = '';
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--logs-dir' && i + 1 < args.length) {
      config.logsDir = args[++i];
    } else if (arg === '--auto-approve') {
      config.autoApprove = true;
    } else if (arg === '--model' && i + 1 < args.length) {
      config.model = args[++i];
    } else if (arg === '--provider' && i + 1 < args.length) {
      config.provider = args[++i];
    } else if (!arg.startsWith('--') && !dotFile) {
      dotFile = arg;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }

    i++;
  }

  if (!dotFile) {
    console.error('Error: no .dot file specified');
    console.error('Usage: attractor <command> <file.dot> [options]');
    process.exit(1);
  }

  return { dotFile, config };
}
