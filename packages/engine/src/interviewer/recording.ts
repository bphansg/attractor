import type { Answer, Interviewer, Question } from './interface.js';

export interface QAPair {
  question: Question;
  answer: Answer;
  timestamp: string;
}

export class RecordingInterviewer implements Interviewer {
  private inner: Interviewer;
  private records: QAPair[];

  constructor(inner: Interviewer) {
    this.inner = inner;
    this.records = [];
  }

  async ask(question: Question): Promise<Answer> {
    const answer = await this.inner.ask(question);
    this.records.push({
      question,
      answer,
      timestamp: new Date().toISOString(),
    });
    return answer;
  }

  async askMultiple(questions: Question[]): Promise<Answer[]> {
    const answers: Answer[] = [];
    for (const question of questions) {
      answers.push(await this.ask(question));
    }
    return answers;
  }

  inform(message: string, stage: string): void {
    this.inner.inform(message, stage);
  }

  getRecords(): QAPair[] {
    return [...this.records];
  }

  clear(): void {
    this.records = [];
  }
}
