export type QuestionType = 'yes_no' | 'multiple_choice' | 'freeform' | 'confirmation';
export type AnswerValue = 'yes' | 'no' | 'skipped' | 'timeout';

export interface Option {
  key: string;
  label: string;
}

export interface Question {
  text: string;
  type: QuestionType;
  options: Option[];
  defaultAnswer?: Answer;
  timeoutSeconds?: number;
  stage: string;
  metadata: Record<string, unknown>;
}

export interface Answer {
  value: string | AnswerValue;
  selectedOption?: Option;
  text: string;
}

export interface Interviewer {
  ask(question: Question): Promise<Answer>;
  askMultiple(questions: Question[]): Promise<Answer[]>;
  inform(message: string, stage: string): void;
}
