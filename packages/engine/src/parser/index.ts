export type { Token, TokenType } from './tokens.js';
export type {
  ASTGraph,
  ASTStatement,
  ASTNodeStmt,
  ASTEdgeStmt,
  ASTAttrStmt,
  ASTSubgraph,
  ASTAttrDecl,
  ASTAttr,
} from './ast.js';
export type { ValueType } from './values.js';
export { Lexer } from './lexer.js';
export { Parser } from './parser.js';
export { ParseError } from './errors.js';
export { parseValue, parseDuration, parseBoolean, parseIntValue, parseFloatValue } from './values.js';

import type { ASTGraph } from './ast.js';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';

/**
 * Convenience function: source string -> AST.
 * Runs the lexer then the recursive-descent parser.
 */
export function parseDot(source: string): ASTGraph {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}
