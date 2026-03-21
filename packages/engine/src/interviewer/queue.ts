import type { Answer, Interviewer, Question } from './interface.js';

export class QueueInterviewer implements Interviewer {
  private answers: Answer[];
  private index: number;

  constructor(answers: Answer[]) {
    this.answers = [...answers];
    this.index = 0;
  }

  async ask(_question: Question): Promise<Answer> {
    if (this.index < this.answers.length) {
      const answer = this.answers[this.index]!;
      this.index++;
      return answer;
    }
    return { value: 'skipped', text: '' };
  }

  async askMultiple(questions: Question[]): Promise<Answer[]> {
    const results: Answer[] = [];
    for (const question of questions) {
      results.push(await this.ask(question));
    }
    return results;
  }

  inform(_message: string, _stage: string): void {
    // Queue interviewer silently ignores informational messages
  }

  remaining(): number {
    return Math.max(0, this.answers.length - this.index);
  }

  reset(): void {
    this.index = 0;
  }
}
