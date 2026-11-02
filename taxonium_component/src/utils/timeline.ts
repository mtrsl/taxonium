import type { Node } from "../types/node";
import type { TimelineSource, TimelineRequest, TimelinePage, TimePrecision, TimelineBar } from "../types/timeline";
import { selectedTipRange, type MetadataTableIndex } from "./metadataTable";
import { createMetadataColor, isMissingMetadata, numericMetadataValue, NEUTRAL_METADATA_COLOR, MISSING_COLOR } from "./metadata";

export const MAX_TIMELINE_BARS = 512;
export const MAX_TIMELINE_SEGMENTS = 64;
const DAY = 86400000;
const name = (field: string) => field.replace(/^meta_/i, "").trim().toLowerCase();
const integer = (value: unknown) => /^\d+$/.test(String(value ?? "").trim()) ? Number(value) : NaN;

/** Strict proleptic Gregorian calendar parsing, independent of local timezone. */
export function calendarDate(year: number, month?: number, day?: number): { year: number; month: number; day: number; precision: TimePrecision } | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  if (month === undefined) return { year, month: 1, day: 1, precision: "year" };
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (day === undefined) return { year, month, day: 1, precision: "month" };
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const limit = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return Number.isInteger(day) && day >= 1 && day <= limit ? { year, month, day, precision: "day" } : null;
}
export function parseISODate(value: unknown) {
  const match = typeof value === "string" && /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  return match ? calendarDate(+match[1], +match[2], match[3] ? +match[3] : undefined) : null;
}
function parseSource(node: Node, fields: string[]) {
  if (fields.length === 1 && (name(fields[0]) !== "year" || parseISODate(node[fields[0]]))) return parseISODate(node[fields[0]]);
  const [y, m, d] = fields.map(field => node[field]);
  if (isMissingMetadata(m)) return isMissingMetadata(d) ? calendarDate(integer(y)) : null;
  return calendarDate(integer(y), integer(m), isMissingMetadata(d) ? undefined : integer(d));
}
function ordinal(date: NonNullable<ReturnType<typeof calendarDate>>, precision: TimePrecision) {
  if (precision === "year") return date.year;
  if (precision === "month") return date.year * 12 + date.month - 1;
  const utc = new Date(0); utc.setUTCFullYear(date.year, date.month - 1, date.day); utc.setUTCHours(0, 0, 0, 0);
  return utc.getTime() / DAY;
}
export function timeLabel(value: number, precision: TimePrecision): string {
  if (precision === "year") return String(value).padStart(4, "0");
  if (precision === "month") return `${String(Math.floor(value / 12)).padStart(4, "0")}-${String(value % 12 + 1).padStart(2, "0")}`;
  return new Date(value * DAY).toISOString().slice(0, 10);
}
export interface TimelineIndex {
  sources: TimelineSource[];
  current?: { id: string; values: Float64Array };
  coloring?: { key: string; codes: Uint8Array; groups: { label: string; value: unknown; neutral?: boolean }[] };
}

/** Discovery retains descriptors only; a single date array is cached for the active source. */
export async function discoverTimeline(nodes: Node[], tips: MetadataTableIndex, fields: string[], checkpoint: () => Promise<void>): Promise<TimelineIndex> {
  const year = fields.find(f => name(f) === "year"), month = fields.find(f => name(f) === "month"), day = fields.find(f => name(f) === "day");
  const candidates = year ? [[year, ...(month ? [month, ...(day ? [day] : [])] : [])]] : [];
  const iso: string[][] = [];
  // Probe each column until a valid ISO value is found; missing/invalid prefixes do not hide sources.
  for (const field of fields) {
    if (candidates[0]?.includes(field)) continue;
    for (let i = 0; i < tips.tips.length; i++) {
      if (i % 8192 === 0) await checkpoint();
      if (parseISODate(nodes[tips.tips[i]][field])) { iso.push([field]); break; }
    }
  }
  iso.sort((a, b) => Number(!/^(date|collection[_ ]?date|sampling[_ ]?date|sample[_ ]?date)$/.test(name(a[0]))) -
    Number(!/^(date|collection[_ ]?date|sampling[_ ]?date|sample[_ ]?date)$/.test(name(b[0]))));
  candidates.push(...iso);
  const sources: TimelineSource[] = [];
  for (const fields of candidates) {
    let precision: TimePrecision = "day", valid = 0;
    // First establish global precision, then bounds in that precision.
    for (let i = 0; i < tips.tips.length; i++) {
      if (i % 8192 === 0) await checkpoint();
      const date = parseSource(nodes[tips.tips[i]], fields);
      if (!date) continue;
      valid++;
      if (date.precision === "year" || (date.precision === "month" && precision === "day")) precision = date.precision;
    }
    if (!valid) continue;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < tips.tips.length; i++) {
      if (i % 8192 === 0) await checkpoint();
      const date = parseSource(nodes[tips.tips[i]], fields);
      if (date) { const value = ordinal(date, precision); min = Math.min(min, value); max = Math.max(max, value); }
    }
    sources.push({ id: fields.join("|"), label: fields.map(f => f.replace(/^meta_/i, "")).join(" / "), fields, precision, min, max, valid });
  }
  return { sources };
}
export async function timelineValues(nodes: Node[], tips: MetadataTableIndex, index: TimelineIndex, source: TimelineSource, checkpoint: () => Promise<void>) {
  if (index.current?.id === source.id) return index.current.values;
  const values = new Float64Array(tips.tips.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (i % 8192 === 0) await checkpoint();
    const date = parseSource(nodes[tips.tips[i]], source.fields);
    if (date) values[i] = ordinal(date, source.precision);
  }
  index.current = { id: source.id, values };
  return values;
}
export async function queryTimeline(nodes: Node[], tips: MetadataTableIndex, index: TimelineIndex, request: TimelineRequest, checkpoint: () => Promise<void>): Promise<TimelinePage> {
  const [start, end] = selectedTipRange(nodes, tips, request.selectedNodeId);
  const source = request.source ? index.sources.find(s => s.id === request.source) : index.sources[0];
  if (request.source && !source) throw new Error("Unknown timeline source");
  const empty = { sources: index.sources, bars: [], overview: [], selectedCount: end - start, datedCount: 0, ignoredCount: end - start };
  if (!source) return empty;
  const values = await timelineValues(nodes, tips, index, source, checkpoint);
  const [low, high] = request.range ?? [source.min, source.max];
  if (![low, high].every(Number.isSafeInteger) || low < source.min || high > source.max || low > high) throw new Error("Invalid timeline range");
  const step = Math.max(1, Math.ceil((high - low + 1) / MAX_TIMELINE_BARS));
  const overviewStep = Math.max(1, Math.ceil((source.max - source.min + 1) / MAX_TIMELINE_BARS));
  const overview = Array.from({ length: Math.ceil((source.max - source.min + 1) / overviewStep) }, (_, i) => ({ start: source.min + i * overviewStep, end: Math.min(source.max, source.min + (i + 1) * overviewStep - 1), count: 0 }));
  const bars: TimelineBar[] = Array.from({ length: Math.ceil((high - low + 1) / step) }, (_, i) => {
    const start = low + i * step, end = Math.min(high, start + step - 1);
    return { start, end, label: start === end ? timeLabel(start, source.precision) : `${timeLabel(start, source.precision)} – ${timeLabel(end, source.precision)}`, count: 0, segments: [] };
  });
  const spec = request.colorSpec;
  const color = spec ? createMetadataColor(spec) : () => request.color ?? NEUTRAL_METADATA_COLOR;
  const colorKey = JSON.stringify([spec?.field, spec?.kind, spec?.min, spec?.max]);
  let coloring = index.coloring;
  if (!coloring || coloring.key !== colorKey) {
    const groups: NonNullable<TimelineIndex["coloring"]>["groups"] = [];
    const codes = new Uint8Array(spec ? tips.tips.length : 0);
    if (!spec) groups.push({ label: "Samples", value: null });
    else {
      groups.push({ label: "Missing", value: null });
      const categories = new Map<string, number>();
      if (spec.kind === "numeric") {
        const min = spec.min ?? 0, max = spec.max ?? min;
        for (let bin = 0; bin < (min === max ? 1 : 16); bin++) {
          const a = min + (max - min) * bin / 16, z = min + (max - min) * (bin + 1) / 16;
          groups.push({ label: min === max ? String(min) : `${Number(a.toPrecision(5))} – ${Number(z.toPrecision(5))}${bin === 15 ? " (inclusive)" : " (upper exclusive)"}`, value: (a + z) / 2 });
        }
      } else {
        // Bounded heavy-hitter candidates, shared across all selections and ranges.
        const frequency = new Map<string, number>();
        for (let i = 0; i < tips.tips.length; i++) {
          if (i % 8192 === 0) await checkpoint();
          const raw = nodes[tips.tips[i]][spec.field];
          if (isMissingMetadata(raw)) continue;
          const key = String(raw);
          if (frequency.has(key) || frequency.size < MAX_TIMELINE_SEGMENTS - 2) frequency.set(key, (frequency.get(key) ?? 0) + 1);
          else for (const [candidate, count] of frequency) { if (count === 1) frequency.delete(candidate); else frequency.set(candidate, count - 1); }
        }
        for (const key of [...frequency.keys()].sort()) { categories.set(key, groups.length); groups.push({ label: key, value: key }); }
        groups.push({ label: "Other categories", value: null, neutral: true });
      }
      for (let i = 0; i < tips.tips.length; i++) {
        if (i % 8192 === 0) await checkpoint();
        const raw = nodes[tips.tips[i]][spec.field];
        if (isMissingMetadata(raw)) continue;
        if (spec.kind === "numeric") {
          const n = numericMetadataValue(raw);
          if (n === null) continue;
          const min = spec.min ?? 0, max = spec.max ?? min;
          codes[i] = 1 + (max === min ? 0 : Math.max(0, Math.min(15, Math.floor((n - min) / (max - min) * 16))));
        } else codes[i] = categories.get(String(raw)) ?? groups.length - 1;
      }
    }
    coloring = { key: colorKey, groups, codes }; index.coloring = coloring;
  }
  const stride = coloring.groups.length;
  const counts = new Uint32Array(bars.length * stride);
  let datedCount = 0;
  for (let i = start; i < end; i++) {
    if (i % 8192 === 0) await checkpoint();
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    datedCount++; overview[Math.floor((value - source.min) / overviewStep)].count++;
    if (value < low || value > high) continue;
    const b = Math.floor((value - low) / step);
    counts[b * stride + (coloring.codes[i] ?? 0)]++; bars[b].count++;
  }
  bars.forEach((bar, i) => {
    coloring!.groups.forEach((group, j) => {
      const count = counts[i * stride + j];
      if (count) bar.segments.push({ label: group.label, count, color: group.neutral ? NEUTRAL_METADATA_COLOR : spec && j === 0 ? MISSING_COLOR : color(group.value) });
    });
  });
  return { sources: index.sources, source, bars, overview, selectedCount: end - start, datedCount, ignoredCount: end - start - datedCount };
}
