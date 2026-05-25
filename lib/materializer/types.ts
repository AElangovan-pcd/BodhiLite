export type CompoundValue = { label: string; smiles: string };
export type MaterializedValue = number | string | CompoundValue;
export type MaterializedValues = Record<string, MaterializedValue>;
