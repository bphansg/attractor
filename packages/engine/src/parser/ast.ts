export interface ASTGraph {
  type: 'graph';
  id: string;
  statements: ASTStatement[];
}

export type ASTStatement =
  | ASTNodeStmt
  | ASTEdgeStmt
  | ASTAttrStmt
  | ASTSubgraph
  | ASTAttrDecl;

export interface ASTNodeStmt {
  type: 'node';
  id: string;
  attrs: ASTAttr[];
}

export interface ASTEdgeStmt {
  type: 'edge';
  nodes: string[]; // chain: [A, B, C] for A->B->C
  attrs: ASTAttr[];
}

export interface ASTAttrStmt {
  type: 'attr_stmt';
  target: 'graph' | 'node' | 'edge';
  attrs: ASTAttr[];
}

export interface ASTSubgraph {
  type: 'subgraph';
  id: string | null;
  statements: ASTStatement[];
}

export interface ASTAttrDecl {
  type: 'attr_decl';
  key: string;
  value: string;
}

export interface ASTAttr {
  key: string;
  value: string;
}
