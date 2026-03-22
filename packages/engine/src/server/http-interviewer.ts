import type { Answer, Interviewer, Question } from '../interviewer/interface.js';

export interface PipelineRun {
  id: string;
  status: 'pending' | 'running' | 'waiting_human' | 'completed' | 'failed' | 'aborted';
  events: Array<Record<string, unknown>>;
  outcome?: Record<string, unknown>;
  pendingQuestion?: Question;
  sseListeners: Set<(data: string) => void>;
  resolveAnswer?: (answer: Answer) => void;
}

/**
 * An Interviewer implementation for the HTTP server.
 * When ask() is called, it stores the question on the PipelineRun,
 * sets status to waiting_human, emits an SSE event, and waits
 * for a POST /answer to resolve the promise.
 */
export class HttpInterviewer implements Interviewer {
  constructor(private run: PipelineRun) {}

  async ask(question: Question): Promise<Answer> {
    this.run.pendingQuestion = question;
    this.run.status = 'waiting_human';

    // Emit SSE event
    const sseData = JSON.stringify({ type: 'question', question });
    for (const listener of this.run.sseListeners) {
      listener(sseData);
    }
    this.run.events.push({ type: 'question', question, timestamp: new Date().toISOString() });

    // Wait for the answer
    return new Promise<Answer>((resolve) => {
      this.run.resolveAnswer = resolve;
    });
  }

  async askMultiple(questions: Question[]): Promise<Answer[]> {
    const answers: Answer[] = [];
    for (const question of questions) {
      answers.push(await this.ask(question));
    }
    return answers;
  }

  inform(message: string, stage: string): void {
    const sseData = JSON.stringify({ type: 'inform', message, stage, timestamp: new Date().toISOString() });
    for (const listener of this.run.sseListeners) {
      listener(sseData);
    }
    this.run.events.push({ type: 'inform', message, stage, timestamp: new Date().toISOString() });
  }
}
