export interface GraphNode {
  id: string;
  label: string;
  shape: string; // default: 'box'
  nodeType: string; // resolved handler type (from shape or explicit type attr)
  prompt: string;
  maxRetries: number;
  goalGate: boolean;
  retryTarget: string;
  fallbackRetryTarget: string;
  fidelity: string;
  threadId: string;
  className: string; // comma-separated classes
  timeout: number | null; // ms
  llmModel: string;
  llmProvider: string;
  reasoningEffort: string;
  autoStatus: boolean;
  allowPartial: boolean;
  attrs: Record<string, string>; // all raw attributes
}

export function createNode(partial: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    label: partial.id,
    shape: 'box',
    nodeType: '',
    prompt: '',
    maxRetries: 0,
    goalGate: false,
    retryTarget: '',
    fallbackRetryTarget: '',
    fidelity: '',
    threadId: '',
    className: '',
    timeout: null,
    llmModel: '',
    llmProvider: '',
    reasoningEffort: '',
    autoStatus: false,
    allowPartial: false,
    attrs: {},
    ...partial,
  };
}
