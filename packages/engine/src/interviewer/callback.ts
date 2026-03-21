import type { Answer, Interviewer, Question } from './interface.js';

export type QuestionCallback = (question: Question) => Promise<Answer>;
export type InformCallback = (message: string, stage: string) => void;

export class CallbackInterviewer implements Interviewer {
  private onQuestion: QuestionCallback;
  private onInform: InformCallback;

  constructor(onQuestion: QuestionCallback, onInform?: InformCallback) {
    this.onQuestion = onQuestion;
    this.onInform = onInform ?? (() => {});
  }

  async ask(question: Question): Promise<Answer> {
    return this.onQuestion(question);
  }

  async askMultiple(questions: Question[]): Promise<Answer[]> {
    const answers: Answer[] = [];
    for (const question of questions) {
      answers.push(await this.onQuestion(question));
    }
    return answers;
  }

  inform(message: string, stage: string): void {
    this.onInform(message, stage);
  }
}
