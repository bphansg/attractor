import { createServer } from '@attractor/engine';

export async function serveCommand(args: string[]): Promise<void> {
  let port = 3000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
    }
  }

  const server = createServer({ port });
  await server.start();
}
