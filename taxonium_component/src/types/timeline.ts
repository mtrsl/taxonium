import type { MetadataColorSpec, RGB } from "../utils/metadata";

export type TimePrecision = "year" | "month" | "day";
export interface TimelineSource { id: string; label: string; fields: string[]; precision: TimePrecision; min: number; max: number; valid: number }
export interface TimelineRequest {
  source?: string;
  selectedNodeId: string | number | null;
  range?: [number, number]; // inclusive calendar-bin ordinals
  colorSpec?: MetadataColorSpec;
  color?: RGB;
  fieldLabel?: string;
}
export interface TimelineSegment { label: string; count: number; color: RGB }
export interface TimelineBar { start: number; end: number; label: string; count: number; segments: TimelineSegment[] }
export interface TimelinePage {
  sources: TimelineSource[];
  source?: TimelineSource;
  bars: TimelineBar[];
  overview: { start: number; end: number; count: number }[];
  selectedCount: number;
  datedCount: number;
  ignoredCount: number;
}
export type TimelineResponse = TimelinePage | { error: string } | { cancelled: true };
