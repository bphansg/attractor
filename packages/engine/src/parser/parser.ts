import type { Token, TokenType } from './tokens.js';
import type {
  ASTGraph,
  ASTStatement,
  ASTNodeStmt,
  ASTEdgeStmt,
  ASTAttrStmt,
  ASTSubgraph,
  ASTAttrDecl,
  ASTAttr,
} from './ast.js';
import { ParseError } from './errors.js';

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTGraph {
    this.expect('DIGRAPH');
    const idToken = this.expect('IDENTIFIER', 'STRING');
    this.expect('LBRACE');
    const statements = this.parseStatements();
    this.expect('RBRACE');

    // Expect EOF
    if (this.current().type !== 'EOF') {
      const t = this.current();
      throw new ParseError(`Unexpected token "${t.value}" after graph body`, t.line, t.column);
    }

    return {
      type: 'graph',
      id: idToken.value,
      statements,
    };
  }

  private parseStatements(): ASTStatement[] {
    const stmts: ASTStatement[] = [];

    while (this.current().type !== 'RBRACE' && this.current().type !== 'EOF') {
      const stmt = this.parseStatement();
      if (stmt) {
        stmts.push(stmt);
      }
      // Consume optional semicolons
      while (this.current().type === 'SEMICOLON') {
        this.advance();
      }
    }

    return stmts;
  }

  private parseStatement(): ASTStatement | null {
    const token = this.current();

    switch (token.type) {
      case 'GRAPH':
        return this.parseAttrStmt('graph');
      case 'NODE':
        return this.parseAttrStmt('node');
      case 'EDGE':
        return this.parseAttrStmt('edge');
      case 'SUBGRAPH':
        return this.parseSubgraph();
      case 'IDENTIFIER':
      case 'STRING':
        return this.parseNodeOrEdgeOrAttrDecl();
      default:
        throw new ParseError(
          `Unexpected token "${token.value}" (${token.type})`,
          token.line,
          token.column,
        );
    }
  }

  private parseAttrStmt(target: 'graph' | 'node' | 'edge'): ASTAttrStmt {
    this.advance(); // consume keyword
    const attrs = this.parseAttrList();
    return { type: 'attr_stmt', target, attrs };
  }

  private parseSubgraph(): ASTSubgraph {
    this.advance(); // consume 'subgraph'

    let id: string | null = null;
    if (this.current().type === 'IDENTIFIER' || this.current().type === 'STRING') {
      id = this.current().value;
      this.advance();
    }

    this.expect('LBRACE');
    const statements = this.parseStatements();
    this.expect('RBRACE');

    return { type: 'subgraph', id, statements };
  }

  private parseNodeOrEdgeOrAttrDecl(): ASTStatement {
    const idToken = this.current();
    this.advance();

    // attr_decl: IDENTIFIER EQUALS value
    if (this.current().type === 'EQUALS') {
      this.advance(); // consume '='
      const valueToken = this.current();
      if (
        valueToken.type === 'STRING' ||
        valueToken.type === 'IDENTIFIER' ||
        valueToken.type === 'INTEGER' ||
        valueToken.type === 'FLOAT' ||
        valueToken.type === 'BOOLEAN' ||
        valueToken.type === 'DURATION'
      ) {
        this.advance();
        const decl: ASTAttrDecl = {
          type: 'attr_decl',
          key: idToken.value,
          value: valueToken.value,
        };
        return decl;
      }
      throw new ParseError(
        `Expected value after '=', got "${valueToken.value}" (${valueToken.type})`,
        valueToken.line,
        valueToken.column,
      );
    }

    // Edge: IDENTIFIER -> IDENTIFIER (-> IDENTIFIER)* [attrs]
    if (this.current().type === 'ARROW') {
      return this.parseEdgeStmt(idToken.value);
    }

    // Node: IDENTIFIER [attrs]?
    const attrs = this.current().type === 'LBRACKET' ? this.parseAttrList() : [];
    const nodeStmt: ASTNodeStmt = {
      type: 'node',
      id: idToken.value,
      attrs,
    };
    return nodeStmt;
  }

  private parseEdgeStmt(firstNode: string): ASTEdgeStmt {
    const nodes: string[] = [firstNode];

    while (this.current().type === 'ARROW') {
      this.advance(); // consume '->'
      const next = this.expect('IDENTIFIER', 'STRING');
      nodes.push(next.value);
    }

    const attrs = this.current().type === 'LBRACKET' ? this.parseAttrList() : [];

    return { type: 'edge', nodes, attrs };
  }

  private parseAttrList(): ASTAttr[] {
    if (this.current().type !== 'LBRACKET') {
      return [];
    }
    this.advance(); // consume '['

    const attrs: ASTAttr[] = [];

    while (this.current().type !== 'RBRACKET' && this.current().type !== 'EOF') {
      const keyToken = this.expect('IDENTIFIER', 'STRING');
      this.expect('EQUALS');
      const valueToken = this.current();

      if (
        valueToken.type !== 'STRING' &&
        valueToken.type !== 'IDENTIFIER' &&
        valueToken.type !== 'INTEGER' &&
        valueToken.type !== 'FLOAT' &&
        valueToken.type !== 'BOOLEAN' &&
        valueToken.type !== 'DURATION'
      ) {
        throw new ParseError(
          `Expected attribute value, got "${valueToken.value}" (${valueToken.type})`,
          valueToken.line,
          valueToken.column,
        );
      }
      this.advance();

      attrs.push({ key: keyToken.value, value: valueToken.value });

      // Optional comma or semicolon separator
      if (this.current().type === 'COMMA' || this.current().type === 'SEMICOLON') {
        this.advance();
      }
    }

    this.expect('RBRACKET');
    return attrs;
  }

  private current(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF' as const, value: '', line: 0, column: 0 };
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private expect(...types: TokenType[]): Token {
    const token = this.current();
    if (!types.includes(token.type)) {
      const expected = types.length === 1 ? types[0] : `one of [${types.join(', ')}]`;
      throw new ParseError(
        `Expected ${expected}, got "${token.value}" (${token.type})`,
        token.line,
        token.column,
      );
    }
    this.advance();
    return token;
  }
}
