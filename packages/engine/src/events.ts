export type ObservabilityEventType =
  | 'pipeline.started'
  | 'pipeline.completed'
  | 'pipeline.failed'
  | 'stage.started'
  | 'stage.completed'
  | 'stage.failed'
  | 'stage.retrying'
  | 'parallel.started'
  | 'parallel.branch.started'
  | 'parallel.branch.completed'
  | 'parallel.completed'
  | 'interview.started'
  | 'interview.completed'
  | 'interview.timeout'
  | 'checkpoint.saved';

export interface ObservabilityEvent {
  type: ObservabilityEventType;
  timestamp: Date;
  data: Record<string, unknown>;
}

export function createEvent(
  type: ObservabilityEventType,
  data: Record<string, unknown> = {},
): ObservabilityEvent {
  return {
    type,
    timestamp: new Date(),
    data,
  };
}
