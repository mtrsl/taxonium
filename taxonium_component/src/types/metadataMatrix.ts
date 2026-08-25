import type { Node } from "./node";
import type {
  MetadataFieldInfo,
  MetadataFieldKind,
  MetadataMatrixColor,
} from "../utils/metadataMatrix";

export type { MetadataFieldInfo, MetadataFieldKind, MetadataMatrixColor };

export interface MetadataMatrixConfig {
  fields: string[];
  colors?: Record<string, MetadataMatrixColor>;
  columnWidth?: number;
}

export interface MetadataMatrixField {
  field: string;
  label: string;
  color: MetadataMatrixColor;
  kind: MetadataFieldKind;
  min?: number;
  max?: number;
}

export interface MetadataMatrixCell {
  node: Node;
  field: string;
  x: number;
  y: number;
  kind: MetadataFieldKind;
  isTrue?: boolean;
  value?: number;
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
  fieldInfo: Record<string, MetadataFieldInfo>;
  matrixFields: MetadataMatrixField[];
  isEnabled: boolean;
  panelWidth: number;
  headerHeight: number;
  columnWidth: number;
  setColumnWidth: (columnWidth: number) => void;
  cellSize: number;
  setSelectedFields: (fields: string[]) => void;
  toggleField: (field: string) => void;
  moveField: (field: string, direction: -1 | 1) => void;
  getFieldColor: (field: string) => MetadataMatrixColor;
  setFieldColor: (field: string, color: MetadataMatrixColor) => void;
  isTruthyValue: (value: unknown) => boolean;
  getValueColor: (
    field: MetadataMatrixField,
    value: unknown
  ) => MetadataMatrixColor | null;
}
