import type { Node } from "./node";

export type MetadataMatrixColor = [number, number, number];

export interface MetadataMatrixConfig {
  fields: string[];
  colors?: Record<string, MetadataMatrixColor>;
}

export interface MetadataMatrixField {
  field: string;
  label: string;
  color: MetadataMatrixColor;
}

export interface MetadataMatrixCell {
  node: Node;
  field: string;
  x: number;
  y: number;
  isTrue: boolean;
  color: MetadataMatrixColor;
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
  color: MetadataMatrixColor;
}

export interface MetadataMatrixHeader {
  field: string;
  label: string;
  x: number;
  color: MetadataMatrixColor;
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
  getFieldColor: (field: string) => MetadataMatrixColor;
  setFieldColor: (field: string, color: MetadataMatrixColor) => void;
  isTruthyValue: (value: unknown) => boolean;
}
