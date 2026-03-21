export interface GraphEdge {
  from: string;
  to: string;
  label: string;
  condition: string;
  weight: number;
  fidelity: string;
  threadId: string;
  loopRestart: boolean;
  attrs: Record<string, string>;
}

export function createEdge(
  from: string,
  to: string,
  partial?: Partial<Omit<GraphEdge, 'from' | 'to'>>,
): GraphEdge {
  return {
    from,
    to,
    label: '',
    condition: '',
    weight: 1,
    fidelity: '',
    threadId: '',
    loopRestart: false,
    attrs: {},
    ...partial,
  };
}
