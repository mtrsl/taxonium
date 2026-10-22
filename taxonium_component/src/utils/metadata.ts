import scale from "scale-color-perceptual";
import { scaleLinear } from "d3-scale";
import { rgb } from "d3-color";
import { isBooleanLikeValue, parseNumericMetadataValue } from "./metadataMatrix";
import type { ColorRamp } from "../types/common";

export type RGB = [number, number, number];
export type MetadataKind = "boolean" | "numeric" | "categorical";
export type MetadataTypeChoice = "auto" | "numeric" | "categorical";
export interface MetadataSummary {
  kind: MetadataKind;
  min?: number;
  max?: number;
}
export interface MetadataOverride {
  type?: Exclude<MetadataTypeChoice, "auto">;
  seed?: number;
  colors?: Record<string, RGB>;
}
export type MetadataOverrides = Record<string, MetadataOverride>;
export interface MetadataColorSpec extends MetadataSummary {
  field: string;
  seed?: number;
  colors?: Record<string, RGB>;
  ramp?: ColorRamp;
}
export const MISSING_COLOR: RGB = [200, 200, 200];
export const NEUTRAL_METADATA_COLOR: RGB = [128, 128, 128];
export const isMissingMetadata = (value: unknown): boolean =>
  value == null || (typeof value === "number" && !Number.isFinite(value)) ||
  (typeof value === "string" && ["", "unknown", "none", "n/a", "na"].includes(value.trim().toLowerCase()));

// Only explicit numeric interpretation parses strings; category identity is untouched.
export const numericMetadataValue = (value: unknown): number | null =>
  isMissingMetadata(value) || (typeof value !== "number" && typeof value !== "string")
    ? null : parseNumericMetadataValue(value);

export function summarizeMetadata(values: Iterable<unknown>): MetadataSummary {
  let any = false, boolean = true, nativeNumeric = true;
  let min = Infinity, max = -Infinity;
  for (const value of values) {
    if (isMissingMetadata(value)) continue;
    any = true;
    boolean &&= isBooleanLikeValue(value);
    nativeNumeric &&= typeof value === "number" && Number.isFinite(value);
    const number = numericMetadataValue(value);
    if (number !== null) { min = Math.min(min, number); max = Math.max(max, number); }
  }
  return {
    kind: any && boolean ? "boolean" : any && nativeNumeric ? "numeric" : "categorical",
    ...(min !== Infinity ? { min, max } : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function sanitizeMetadataOverrides(raw?: string): MetadataOverrides {
  const result: MetadataOverrides = Object.create(null);
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (!isRecord(parsed)) return result;
    for (const [field, value] of Object.entries(parsed)) {
      if (!field.startsWith("meta_") || !isRecord(value)) continue;
      const entry: MetadataOverride = {};
      if (value.type === "numeric" || value.type === "categorical") entry.type = value.type;
      if (Number.isSafeInteger(value.seed) && Number(value.seed) >= 0) entry.seed = Number(value.seed);
      if (isRecord(value.colors)) {
        entry.colors = Object.fromEntries(Object.entries(value.colors).filter(([, color]) =>
          Array.isArray(color) && color.length === 3 && color.every(c => typeof c === "number" && Number.isFinite(c))
        ).map(([key, color]) => [key, (color as number[]).map(c => Math.round(Math.max(0, Math.min(255, c)))) as RGB]));
      }
      result[field] = entry;
    }
  } catch { /* Old or malformed URLs use defaults. */ }
  return result;
}

export function resolveMetadataSpec(field: string, summary: MetadataSummary,
  configured: { kind?: MetadataKind } | undefined, override: MetadataOverride = {},
  ramp?: ColorRamp, colors?: Record<string, RGB>): MetadataColorSpec {
  const kind = override.type ?? configured?.kind ?? (ramp ? "numeric" : summary.kind);
  return { ...summary, field, kind, seed: override.seed,
    colors: { ...(override.seed === undefined ? colors : {}), ...override.colors },
    ramp: kind === "numeric" ? ramp : undefined };
}

function categoryColor(field: string, value: string, seed = 0): RGB {
  let hash = 2166136261;
  for (const ch of JSON.stringify([field, value, seed])) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  }
  // Spread nearby identifiers across a bright, moderately saturated colour space.
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13;
  const hue = (hash >>> 0) % 360;
  const saturation = 55 + ((hash >>> 10) % 26);
  const lightness = 40 + ((hash >>> 20) % 21);
  const color = rgb(`hsl(${hue},${saturation}%,${lightness}%)`);
  return [Math.round(color.r), Math.round(color.g), Math.round(color.b)];
}

export function createMetadataColor(spec: MetadataColorSpec): (value: unknown) => RGB {
  const ramp = spec.ramp?.scale.length ? scaleLinear<string, string>()
    .domain(spec.ramp.scale.map(([n]) => n)).range(spec.ramp.scale.map(([, c]) => c)).clamp(true) : null;
  const cache = new Map<string, RGB>();
  return (value) => {
    if (isMissingMetadata(value)) return MISSING_COLOR;
    if (spec.kind === "numeric") {
      const number = numericMetadataValue(value);
      if (number === null) return MISSING_COLOR;
      let css: string;
      if (spec.ramp?.scale.length === 1) css = spec.ramp.scale[0][1];
      else if (ramp) css = ramp(number);
      else {
        if (spec.min === undefined || spec.max === undefined) return MISSING_COLOR;
        const fraction = spec.max === spec.min ? 0.5 : (number - spec.min) / (spec.max - spec.min);
        css = scale.plasma(Math.max(0, Math.min(1, fraction)));
      }
      const color = rgb(css);
      return Number.isFinite(color.r) ? [Math.round(color.r), Math.round(color.g), Math.round(color.b)] : MISSING_COLOR;
    }
    const key = String(value);
    if (spec.colors && Object.hasOwn(spec.colors, key)) return spec.colors[key];
    let color = cache.get(key);
    if (!color) {
      color = categoryColor(spec.field, key, spec.seed);
      // Bound caches for identifier columns with millions of unique values.
      if (cache.size < 10000) cache.set(key, color);
    }
    return color;
  };
}

export function metadataLegendRamp(spec: MetadataColorSpec): ColorRamp | undefined {
  if (spec.kind !== "numeric") return undefined;
  if (spec.ramp) return spec.ramp;
  if (spec.min === undefined || spec.max === undefined) return undefined;
  const color = createMetadataColor(spec);
  const count = spec.min === spec.max ? 1 : 16;
  return { scale: Array.from({ length: count }, (_, i) => {
    const value = spec.min! + (spec.max! - spec.min!) * (count === 1 ? 0 : i / (count - 1));
    return [value, `rgb(${color(value).join(",")})`];
  }) };
}

// Counts are local to a row, never one full-dataset prefix array per category.
export function categoricalMode(values: Iterable<unknown>): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null, bestCount = 0;
  for (const value of values) {
    if (isMissingMetadata(value)) continue;
    const key = String(value), count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > bestCount || (count === bestCount && (best === null || key < best))) {
      best = key; bestCount = count;
    }
  }
  return best;
}
