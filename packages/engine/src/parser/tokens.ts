export type TokenType =
  | 'DIGRAPH'
  | 'GRAPH'
  | 'NODE'
  | 'EDGE'
  | 'SUBGRAPH'
  | 'IDENTIFIER'
  | 'STRING'
  | 'INTEGER'
  | 'FLOAT'
  | 'BOOLEAN'
  | 'DURATION'
  | 'ARROW' // ->
  | 'LBRACKET' // [
  | 'RBRACKET' // ]
  | 'LBRACE' // {
  | 'RBRACE' // }
  | 'EQUALS' // =
  | 'COMMA' // ,
  | 'SEMICOLON' // ;
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}
