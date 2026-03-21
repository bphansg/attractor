import * as readline from 'node:readline';
import type { Answer, Interviewer, Question } from './interface.js';

export class ConsoleInterviewer implements Interviewer {
  private input: NodeJS.ReadableStream;
  private output: NodeJS.WritableStream;

  constructor(input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream) {
    this.input = input ?? process.stdin;
    this.output = output ?? process.stdout;
  }

  async ask(question: Question): Promise<Answer> {
    const prompt = this.formatPrompt(question);

    const rawAnswer = await this.readLine(prompt, question.timeoutSeconds);

    if (rawAnswer === null) {
      return question.defaultAnswer ?? { value: 'timeout', text: '' };
    }

    const trimmed = rawAnswer.trim();

    if (question.type === 'yes_no') {
      const lower = trimmed.toLowerCase();
      if (lower === 'y' || lower === 'yes') {
        return { value: 'yes', text: 'yes' };
      }
      return { value: 'no', text: 'no' };
    }

    if (question.type === 'confirmation') {
      const lower = trimmed.toLowerCase();
      if (lower === '' || lower === 'y' || lower === 'yes') {
        return { value: 'yes', text: 'yes' };
      }
      return { value: 'no', text: 'no' };
    }

    if (question.type === 'multiple_choice') {
      const upperTrimmed = trimmed.toUpperCase();
      const match = question.options.find(
        (opt) =>
          opt.key.toUpperCase() === upperTrimmed ||
          opt.label.toLowerCase() === trimmed.toLowerCase(),
      );
      if (match) {
        return { value: match.key, selectedOption: match, text: match.label };
      }
      // Fall back to default or first option
      if (question.defaultAnswer) {
        return question.defaultAnswer;
      }
      const first = question.options[0];
      if (first) {
        return { value: first.key, selectedOption: first, text: first.label };
      }
      return { value: trimmed, text: trimmed };
    }

    // freeform
    return { value: trimmed, text: trimmed };
  }

  async askMultiple(questions: Question[]): Promise<Answer[]> {
    const answers: Answer[] = [];
    for (const question of questions) {
      answers.push(await this.ask(question));
    }
    return answers;
  }

  inform(message: string, stage: string): void {
    this.writeLine(`[${stage}] ${message}`);
  }

  private formatPrompt(question: Question): string {
    const lines: string[] = [];
    lines.push(`\n${question.text}`);

    if (question.type === 'yes_no') {
      lines.push('  (y/n)');
    } else if (question.type === 'confirmation') {
      lines.push('  (Y/n)');
    } else if (question.type === 'multiple_choice' && question.options.length > 0) {
      for (const opt of question.options) {
        lines.push(`  [${opt.key}] ${opt.label}`);
      }
    }

    lines.push('> ');
    return lines.join('\n');
  }

  private readLine(prompt: string, timeoutSeconds?: number): Promise<string | null> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: this.input,
        output: this.output,
        terminal: false,
      });

      let timer: ReturnType<typeof setTimeout> | undefined;
      let resolved = false;

      const finish = (value: string | null): void => {
        if (resolved) return;
        resolved = true;
        if (timer !== undefined) clearTimeout(timer);
        rl.close();
        resolve(value);
      };

      if (timeoutSeconds !== undefined && timeoutSeconds > 0) {
        timer = setTimeout(() => finish(null), timeoutSeconds * 1000);
      }

      this.writeLine(prompt);

      rl.once('line', (line) => finish(line));
      rl.once('close', () => finish(null));
    });
  }

  private writeLine(text: string): void {
    const stream = this.output as NodeJS.WritableStream & { write(s: string): boolean };
    stream.write(text);
  }
}
