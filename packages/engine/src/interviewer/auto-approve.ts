import type { Answer, Interviewer, Question } from './interface.js';

export class AutoApproveInterviewer implements Interviewer {
  async ask(question: Question): Promise<Answer> {
    switch (question.type) {
      case 'yes_no':
      case 'confirmation':
        return { value: 'yes', text: 'yes' };
      case 'multiple_choice': {
        const first = question.options[0];
        if (first) {
          return {
            value: first.key,
            selectedOption: first,
            text: first.label,
          };
        }
        return { value: 'auto-approved', text: 'auto-approved' };
      }
      case 'freeform':
        return { value: 'auto-approved', text: 'auto-approved' };
    }
  }

  async askMultiple(questions: Question[]): Promise<Answer[]> {
    const answers: Answer[] = [];
    for (const question of questions) {
      answers.push(await this.ask(question));
    }
    return answers;
  }

  inform(_message: string, _stage: string): void {
    // Auto-approve silently ignores informational messages
  }
}
