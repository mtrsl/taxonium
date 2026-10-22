import type { MetadataColorSpec, RGB } from "../utils/metadata";

export interface EmbeddingRequest {
  selectedNodeId: string | number | null;
  bounds: [number, number, number, number]; // minX, minY, maxX, maxY
  width: number;
  height: number;
  colorSpec?: MetadataColorSpec;
  fieldLabel?: string;
  nameField?: string;
  color?: RGB;
}

export interface EmbeddingPoint {
  x: number;
  y: number;
  count: number;
  color: [number, number, number, number];
  label: string;
}

export interface EmbeddingPage {
  points: EmbeddingPoint[];
  selectedCount: number;
  matchedCount: number;
  bounds: [number, number, number, number] | null;
}

export interface EmbeddingDiagnostics {
  supplied: boolean;
  available: boolean;
  matchedSamples: number;
  invalidCoordinateRecords: number;
  unmatchedIdentifiers: number;
  error?: string;
}

export type EmbeddingResponse = EmbeddingPage | { error: string } | { cancelled: true };
