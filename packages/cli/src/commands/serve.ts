export async function serveCommand(_args: string[]): Promise<void> {
  console.log('');
  console.log('Attractor HTTP Server — coming soon');
  console.log('');
  console.log('Planned endpoints:');
  console.log('  POST /api/v1/run           Start a pipeline run');
  console.log('  GET  /api/v1/runs          List pipeline runs');
  console.log('  GET  /api/v1/runs/:id       Get run status');
  console.log('  POST /api/v1/runs/:id/stop  Stop a running pipeline');
  console.log('  POST /api/v1/validate      Validate a DOT file');
  console.log('  GET  /api/v1/health        Health check');
  console.log('  WS   /api/v1/runs/:id/events  Live event stream');
  console.log('');
  console.log('Implementation will use Fastify.');
  console.log('');

  process.exit(0);
}
