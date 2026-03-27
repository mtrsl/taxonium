import type { Node } from "./node";

export interface MetadataMatrixConfig {
  fields: string[];
}

export interface MetadataMatrixField {
  field: string;
  label: string;
  color: [number, number, number];
}

export interface MetadataMatrixCell {
  node: Node;
  field: string;
  x: number;
  y: number;
  isTrue: boolean;
  color: [number, number, number];
}

export type MetadataMatrixRenderMode =
  | "boxes"
  | "rectangles"
  | "strips"
  | "density";

export interface MetadataMatrixDensityBin {
  field: string;
  x: number;
  y0: number;
  y1: number;
  trueCount: number;
  totalCount: number;
  fraction: number;
  color: [number, number, number];
}

export interface MetadataMatrixHeader {
  field: string;
  label: string;
  x: number;
  color: [number, number, number];
}

export interface MetadataMatrix {
  selectedFields: string[];
  availableFields: string[];
  matrixFields: MetadataMatrixField[];
  isEnabled: boolean;
  panelWidth: number;
  headerHeight: number;
  columnWidth: number;
  cellSize: number;
  setSelectedFields: (fields: string[]) => void;
  toggleField: (field: string) => void;
  moveField: (field: string, direction: -1 | 1) => void;
  isTruthyValue: (value: unknown) => boolean;
}
