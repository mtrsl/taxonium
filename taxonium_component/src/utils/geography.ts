import type { Node } from "../types/node";
import type { GeographicRequest, GeographicPage } from "../types/geography";
import type { MetadataDensityField } from "../types/backend";
import { selectedTipRange, type MetadataTableIndex } from "./metadataTable";
import { buildCategoryIndex, categoryGroupMode, type CategoryIndex } from "./categoricalDensity";
import { createMetadataColor, numericMetadataValue, MISSING_COLOR } from "./metadata";
import { TRUE_VALUES, normalizeMetadataValue } from "./metadataMatrix";
import { aggregateColor } from "./metadataAggregate";
import { densityValueLabel, metadataValueLabel } from "./metadataTooltip";

export const MAX_GEOGRAPHIC_POINTS = 4096;
const MAX_LAT = 85.0511287798066;
const wrap = (x: number) => ((x % 1) + 1) % 1;
export function coordinateFields(fields: string[]): [string, string] | null {
  const sorted = [...fields].sort();
  const find = (names: string[]) => names.map(name => sorted.find(field =>
    field.replace(/^meta_/i, "").trim().toLowerCase() === name)).find(Boolean);
  const lat = find(["latitude", "lat"]), lon = find(["longitude", "lon", "long"]);
  return lat && lon ? [lat, lon] : null;
}
const projectY = (lat: number) => {
  const radians = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
};
const unprojectY = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;
interface Group { head: number; count: number; x: number; y: number }
interface Geometry {
  key: string; groups: Group[]; next: Int32Array; selectedCount: number; mappedCount: number;
  bounds: GeographicPage["bounds"];
}
export interface GeographicIndex {
  x: Float64Array; y: Float64Array; available: boolean;
  geometry?: Geometry;
  category?: { field: string; index: CategoryIndex };
  summary?: { geometry: Geometry; field: string; kind: string; result: MetadataDensityField };
}
export async function buildGeographicIndex(nodes: Node[], tips: MetadataTableIndex,
  fields: string[], checkpoint: () => Promise<void>): Promise<GeographicIndex> {
  const pair = coordinateFields(fields);
  const x = new Float64Array(pair ? tips.tips.length : 0).fill(NaN), y = new Float64Array(x.length);
  if (pair) for (let i = 0; i < x.length; i++) {
    if (i % 8192 === 0) await checkpoint();
    const node = nodes[tips.tips[i]];
    const lat = numericMetadataValue(node[pair[0]]), lon = numericMetadataValue(node[pair[1]]);
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    x[i] = wrap((lon + 180) / 360); y[i] = projectY(lat);
  }
  return { x, y, available: !!pair };
}

export async function queryGeography(nodes: Node[], tips: MetadataTableIndex, index: GeographicIndex,
  request: GeographicRequest, checkpoint: () => Promise<void>): Promise<GeographicPage> {
  if (!request.bounds.every(Number.isFinite) || !Number.isFinite(request.zoom) ||
    !Number.isFinite(request.width) || !Number.isFinite(request.height) || request.width <= 0 || request.height <= 0)
    throw new Error("Invalid geographic viewport");
  const [start, end] = selectedTipRange(nodes, tips, request.selectedNodeId);
  const key = JSON.stringify([start, end, request.bounds, request.zoom, request.width, request.height]);
  let geometry = index.geometry;
  if (!geometry || geometry.key !== key) {
    const [west, south, east, north] = request.bounds;
    const left = (west + 180) / 360, right = (east + 180) / 360 + (east < west ? 1 : 0);
    const span = right - left, top = projectY(north), bottom = projectY(south);
    const worldSize = 512 * 2 ** Math.max(0, Math.min(24, request.zoom));
    let cell = Math.max(32 / worldSize, Math.max(span, bottom - top) / 62);
    const next = new Int32Array(index.x.length).fill(-1);
    let groups: Group[] = [], mappedCount = 0;
    let minX = Infinity, maxX = -Infinity, minShift = Infinity, maxShift = -Infinity, minY = Infinity, maxY = -Infinity;
    // A bounded grid makes main-thread work independent of the number of samples.
    for (;;) {
      groups = []; const cells = new Map<string, number>(); mappedCount = 0;
      for (let i = start; i < Math.min(end, index.x.length); i++) {
        if (i % 8192 === 0) await checkpoint();
        const x = index.x[i], y = index.y[i];
        if (!Number.isFinite(x)) continue;
        mappedCount++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        const shifted = x < 0.5 ? x + 1 : x;
        minShift = Math.min(minShift, shifted); maxShift = Math.max(maxShift, shifted);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const visibleX = x + Math.ceil(left - x);
        if ((span < 1 && visibleX > right) || y < top || y > bottom) continue;
        const groupKey = `${Math.floor(visibleX / cell)},${Math.floor(y / cell)}`;
        let g = cells.get(groupKey);
        if (g === undefined) { g = groups.length; cells.set(groupKey, g); groups.push({ head: -1, count: 0, x: 0, y: 0 }); }
        const group = groups[g]; next[i] = group.head; group.head = i;
        group.count++; group.x += visibleX; group.y += y;
      }
      if (groups.length <= MAX_GEOGRAPHIC_POINTS) break;
      cell *= 2;
    }
    if (maxShift - minShift < maxX - minX) { minX = minShift; maxX = maxShift; }
    geometry = { key, groups, next, selectedCount: end - start, mappedCount,
      bounds: mappedCount ? [minX * 360 - 180, unprojectY(maxY), maxX * 360 - 180, unprojectY(minY)] : null };
    index.geometry = geometry;
    index.summary = undefined;
  }
  const { groups, next } = geometry, spec = request.colorSpec;
  let summary: MetadataDensityField | undefined;
  if (spec) {
    if (index.summary?.geometry === geometry && index.summary.field === spec.field && index.summary.kind === spec.kind)
      summary = index.summary.result;
    else {
      if (spec.kind === "categorical" && index.category?.field !== spec.field) {
        const category = await buildCategoryIndex(tips.tips.length, i => nodes[tips.tips[i]][spec.field], checkpoint);
        index.category = { field: spec.field, index: category };
      }
      summary = { kind: spec.kind, totalCounts: Uint32Array.from(groups, g => g.count),
        ...(spec.kind === "categorical" ? { categoryValues: new Array(groups.length).fill(null) } :
          spec.kind === "numeric" ? { valueSums: new Float64Array(groups.length), valueCounts: new Uint32Array(groups.length) } :
            { trueCounts: new Uint32Array(groups.length) }) };
      for (let g = 0; g < groups.length; g++) {
        await checkpoint();
        if (summary.categoryValues) summary.categoryValues[g] = await categoryGroupMode(index.category!.index, groups[g].head, next, checkpoint);
        else {
          let visited = 0;
          for (let i = groups[g].head; i !== -1; i = next[i]) {
            if (visited++ % 8192 === 0) await checkpoint();
            const value = nodes[tips.tips[i]][spec.field];
            if (summary.valueSums && summary.valueCounts) {
              const n = numericMetadataValue(value);
              if (n !== null) { summary.valueSums[g] += n; summary.valueCounts[g]++; }
            } else if (summary.trueCounts && TRUE_VALUES.has(normalizeMetadataValue(value))) summary.trueCounts[g]++;
          }
        }
      }
      index.summary = { geometry, field: spec.field, kind: spec.kind, result: summary };
    }
  }
  const color = spec ? createMetadataColor(spec) : null;
  const points = groups.map((group, g) => ({ longitude: wrap(group.x / group.count) * 360 - 180,
    latitude: unprojectY(group.y / group.count), count: group.count,
    color: summary ? aggregateColor(summary, g, request.color ?? MISSING_COLOR, color) : [...MISSING_COLOR, 255] as [number, number, number, number],
    label: (group.count === 1 ? `${metadataValueLabel(nodes[tips.tips[group.head]][request.nameField ?? "name"])}\n` : "") + `${group.count.toLocaleString()} sample${group.count === 1 ? "" : "s"}` + (spec && summary ?
      `\n${request.fieldLabel ?? spec.field.replace(/^meta_/, "")}: ${group.count === 1 ? metadataValueLabel(nodes[tips.tips[group.head]][spec.field]) : densityValueLabel(summary, g)}` : ""),
  }));
  return { points, selectedCount: geometry.selectedCount, mappedCount: geometry.mappedCount,
    bounds: geometry.bounds, available: index.available };
}
