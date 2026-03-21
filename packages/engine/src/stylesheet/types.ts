export type SelectorType = 'universal' | 'shape' | 'class' | 'id';

export interface StyleSelector {
  type: SelectorType;
  /** '*' for universal, shape name, class name (without dot), node id (without #) */
  value: string;
  /** 0=universal, 1=shape, 2=class, 3=id */
  specificity: number;
}

export interface StyleDeclaration {
  property: 'llm_model' | 'llm_provider' | 'reasoning_effort';
  value: string;
}

export interface StyleRule {
  selector: StyleSelector;
  declarations: StyleDeclaration[];
}
