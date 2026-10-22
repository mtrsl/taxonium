import type { MetadataColorSpec, RGB } from "../utils/metadata";
export interface GeographicRequest {
  selectedNodeId: string | number | null;
  bounds: [number, number, number, number]; // west, south, east, north; east may exceed 180
  zoom: number;
  width: number;
  height: number;
  colorSpec?: MetadataColorSpec;
  fieldLabel?: string;
  nameField?: string;
  color?: RGB;
}
export interface GeographicPoint {
  longitude: number;
  latitude: number;
  count: number;
  color: [number, number, number, number];
  label: string;
}
export interface GeographicPage {
  points: GeographicPoint[];
  selectedCount: number;
  mappedCount: number;
  bounds: [number, number, number, number] | null;
  available: boolean;
}
export type GeographicResponse = GeographicPage | { error: string } | { cancelled: true };
