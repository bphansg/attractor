import type { Token, TokenType } from './tokens.js';
import { ParseError } from './errors.js';

const KEYWORDS: Record<string, TokenType> = {
  digraph: 'DIGRAPH',
  graph: 'GRAPH',
  node: 'NODE',
  edge: 'EDGE',
  subgraph: 'SUBGRAPH',
  true: 'BOOLEAN',
  false: 'BOOLEAN',
};

const DURATION_UNITS = new Set(['ms', 's', 'm', 'h', 'd']);

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = this.stripComments(source);
  }

  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      if (ch === '"') {
        this.readString();
      } else if (ch === '-' && this.peek(1) === '>') {
        this.addToken('ARROW', '->', 2);
      } else if (ch === '[') {
        this.addToken('LBRACKET', '[', 1);
      } else if (ch === ']') {
        this.addToken('RBRACKET', ']', 1);
      } else if (ch === '{') {
        this.addToken('LBRACE', '{', 1);
      } else if (ch === '}') {
        this.addToken('RBRACE', '}', 1);
      } else if (ch === '=') {
        this.addToken('EQUALS', '=', 1);
      } else if (ch === ',') {
        this.addToken('COMMA', ',', 1);
      } else if (ch === ';') {
        this.addToken('SEMICOLON', ';', 1);
      } else if (this.isDigit(ch) || (ch === '-' && this.isDigit(this.peek(1) ?? ''))) {
        this.readNumber();
      } else if (this.isIdentStart(ch)) {
        this.readIdentifierOrKeyword();
      } else {
        throw new ParseError(`Unexpected character: '${ch}'`, this.line, this.column);
      }
    }

    this.tokens.push({ type: 'EOF', value: '', line: this.line, column: this.column });
    return this.tokens;
  }

  private stripComments(source: string): string {
    let result = '';
    let i = 0;
    while (i < source.length) {
      if (source[i] === '"') {
        // Skip through quoted strings without stripping
        result += source[i];
        i++;
        while (i < source.length && source[i] !== '"') {
          if (source[i] === '\\' && i + 1 < source.length) {
            result += source[i];
            i++;
          }
          result += source[i];
          i++;
        }
        if (i < source.length) {
          result += source[i]; // closing quote
          i++;
        }
      } else if (source[i] === '/' && i + 1 < source.length && source[i + 1] === '/') {
        // Line comment — replace with spaces to preserve line/col tracking
        while (i < source.length && source[i] !== '\n') {
          result += ' ';
          i++;
        }
      } else if (source[i] === '/' && i + 1 < source.length && source[i + 1] === '*') {
        // Block comment — replace with spaces/newlines to preserve positions
        result += ' ';
        i += 2; // skip /*
        result += ' ';
        while (i < source.length) {
          if (source[i] === '*' && i + 1 < source.length && source[i + 1] === '/') {
            result += ' ';
            i++;
            result += ' ';
            i++;
            break;
          }
          result += source[i] === '\n' ? '\n' : ' ';
          i++;
        }
      } else {
        result += source[i];
        i++;
      }
    }
    return result;
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === '\n') {
        this.line++;
        this.column = 1;
        this.pos++;
      } else if (ch === '\r') {
        this.pos++;
        if (this.pos < this.source.length && this.source[this.pos] === '\n') {
          this.pos++;
        }
        this.line++;
        this.column = 1;
      } else if (ch === ' ' || ch === '\t') {
        this.column++;
        this.pos++;
      } else {
        break;
      }
    }
  }

  private peek(offset: number): string | undefined {
    return this.source[this.pos + offset];
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isIdentStart(ch: string): boolean {
    return (
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      ch === '_'
    );
  }

  private isIdentChar(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }

  private addToken(type: TokenType, value: string, length: number): void {
    this.tokens.push({ type, value, line: this.line, column: this.column });
    this.pos += length;
    this.column += length;
  }

  private readString(): void {
    const startLine = this.line;
    const startCol = this.column;
    this.pos++; // skip opening quote
    this.column++;

    let value = '';
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === '\\' && this.pos + 1 < this.source.length) {
        const next = this.source[this.pos + 1];
        switch (next) {
          case '"':
            value += '"';
            break;
          case '\\':
            value += '\\';
            break;
          case 'n':
            value += '\n';
            break;
          case 't':
            value += '\t';
            break;
          default:
            value += '\\' + next;
            break;
        }
        this.pos += 2;
        this.column += 2;
      } else if (ch === '"') {
        this.pos++;
        this.column++;
        this.tokens.push({ type: 'STRING', value, line: startLine, column: startCol });
        return;
      } else if (ch === '\n') {
        value += ch;
        this.pos++;
        this.line++;
        this.column = 1;
      } else {
        value += ch;
        this.pos++;
        this.column++;
      }
    }

    throw new ParseError('Unterminated string literal', startLine, startCol);
  }

  private readNumber(): void {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;

    // optional negative sign
    if (this.source[this.pos] === '-') {
      this.pos++;
      this.column++;
    }

    // Read digits
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      this.pos++;
      this.column++;
    }

    // Check for duration suffix (must come before float check)
    if (this.pos < this.source.length) {
      const remaining = this.source.slice(this.pos);
      // Try 'ms' first (2-char unit), then single-char units
      for (const unit of ['ms', 's', 'm', 'h', 'd']) {
        if (remaining.startsWith(unit)) {
          // Make sure the char after the unit is not an ident char (so 'max' doesn't match 'm')
          const afterUnit = this.source[this.pos + unit.length];
          if (afterUnit === undefined || !this.isIdentChar(afterUnit)) {
            const value = this.source.slice(startPos, this.pos + unit.length);
            this.pos += unit.length;
            this.column += unit.length;
            this.tokens.push({ type: 'DURATION', value, line: startLine, column: startCol });
            return;
          }
        }
      }
    }

    // Check for float
    if (this.pos < this.source.length && this.source[this.pos] === '.') {
      this.pos++;
      this.column++;
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        this.pos++;
        this.column++;
      }
      const value = this.source.slice(startPos, this.pos);
      this.tokens.push({ type: 'FLOAT', value, line: startLine, column: startCol });
      return;
    }

    const value = this.source.slice(startPos, this.pos);
    this.tokens.push({ type: 'INTEGER', value, line: startLine, column: startCol });
  }

  private readIdentifierOrKeyword(): void {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;

    while (this.pos < this.source.length && this.isIdentChar(this.source[this.pos])) {
      this.pos++;
      this.column++;
    }

    // Allow dotted identifiers like "wait.human"
    while (
      this.pos < this.source.length &&
      this.source[this.pos] === '.' &&
      this.pos + 1 < this.source.length &&
      this.isIdentChar(this.source[this.pos + 1])
    ) {
      this.pos++; // skip dot
      this.column++;
      while (this.pos < this.source.length && this.isIdentChar(this.source[this.pos])) {
        this.pos++;
        this.column++;
      }
    }

    const value = this.source.slice(startPos, this.pos);
    const lower = value.toLowerCase();

    // Check keywords (case-insensitive)
    const keywordType = KEYWORDS[lower];
    if (keywordType) {
      this.tokens.push({ type: keywordType, value, line: startLine, column: startCol });
    } else {
      this.tokens.push({ type: 'IDENTIFIER', value, line: startLine, column: startCol });
    }
  }
}
