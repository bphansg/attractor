export class ParseError extends Error {
  public readonly line: number;
  public readonly column: number;

  constructor(message: string, line: number, column: number) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = 'ParseError';
    this.line = line;
    this.column = column;
  }
}
