import { AutoApproveInterviewer } from '../interviewer/auto-approve.js';
import type { CodergenBackend } from './codergen.js';
import { CodergenHandler } from './codergen.js';
import { ConditionalHandler } from './conditional.js';
import { ExitHandler } from './exit.js';
import { FanInHandler } from './fan-in.js';
import { HandlerRegistry } from './interface.js';
import { ManagerLoopHandler } from './manager-loop.js';
import { ParallelHandler } from './parallel.js';
import { StartHandler } from './start.js';
import { ToolHandler } from './tool.js';
import { WaitHumanHandler } from './wait-human.js';

export { type Handler, HandlerRegistry } from './interface.js';
export { StartHandler } from './start.js';
export { ExitHandler } from './exit.js';
export { ConditionalHandler } from './conditional.js';
export { type CodergenBackend, CodergenHandler } from './codergen.js';
export { WaitHumanHandler } from './wait-human.js';
export { ParallelHandler, type SubRunner } from './parallel.js';
export { FanInHandler } from './fan-in.js';
export { ToolHandler } from './tool.js';
export { ManagerLoopHandler } from './manager-loop.js';

/**
 * Creates a HandlerRegistry pre-populated with all default handlers.
 * The codergen handler uses a stub backend that returns an empty string.
 * Replace it by registering a custom CodergenHandler after creation.
 */
export function createDefaultRegistry(backend?: CodergenBackend): HandlerRegistry {
  const registry = new HandlerRegistry();

  const defaultBackend: CodergenBackend = backend ?? {
    async run() {
      return '';
    },
  };

  registry.register('start', new StartHandler());
  registry.register('exit', new ExitHandler());
  registry.register('conditional', new ConditionalHandler());
  registry.register('codergen', new CodergenHandler(defaultBackend));
  registry.register('wait-human', new WaitHumanHandler(new AutoApproveInterviewer()));
  registry.register('parallel', new ParallelHandler(async (_node, _ctx, _graph, _logs) => {
    return { status: 'success', preferredLabel: '', suggestedNextIds: [], contextUpdates: {}, notes: '', failureReason: '' };
  }));
  registry.register('fan-in', new FanInHandler());
  registry.register('tool', new ToolHandler());
  registry.register('manager-loop', new ManagerLoopHandler());

  // Also register dotted aliases used by the spec
  registry.register('wait.human', new WaitHumanHandler(new AutoApproveInterviewer()));
  registry.register('parallel.fan_in', new FanInHandler());
  registry.register('stack.manager_loop', new ManagerLoopHandler());

  return registry;
}
