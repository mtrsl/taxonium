import type { MetadataDensityField } from "../types/backend";
import type { Node } from "../types/node";
import type { MetadataColorSpec, RGB } from "./metadata";
import type { MetadataTableIndex } from "./metadataTable";
import { buildCategoryIndex, categoryGroupMode, type CategoryIndex } from "./categoricalDensity";
import { createMetadataColor, numericMetadataValue, MISSING_COLOR } from "./metadata";
import { TRUE_VALUES, normalizeMetadataValue } from "./metadataMatrix";
import { aggregateColor } from "./metadataAggregate";
import { densityValueLabel, metadataValueLabel } from "./metadataTooltip";

export const MAX_SPATIAL_MARKERS = 4096;
export const SPATIAL_CELL_PIXELS = 32;

export interface SpatialGroup {
  head: number;
  count: number;
  x: number;
  y: number;
}

export interface SpatialGeometry {
  key: string;
  groups: SpatialGroup[];
  next: Int32Array;
  selectedCount: number;
  mappedCount: number;
  bounds: [number, number, number, number] | null;
}

export interface SpatialAggregationIndex {
  geometry?: SpatialGeometry;
  category?: { field: string; index: CategoryIndex };
  summary?: { geometry: SpatialGeometry; field: string; kind: string; result: MetadataDensityField };
}

export interface SpatialMarker {
  x: number;
  y: number;
  count: number;
  color: [number, number, number, number];
  label: string;
}

interface GroupingOptions {
  wrapX?: boolean;
  flipY?: boolean;
}

/** Build a single cached pixel grid for either projected or Cartesian coordinates. */
export async function buildSpatialGeometry(
  x: Float64Array,
  y: Float64Array,
  start: number,
  end: number,
  bounds: [number, number, number, number],
  width: number,
  height: number,
  key: string,
  checkpoint: () => Promise<void>,
  options: GroupingOptions = {},
): Promise<SpatialGeometry> {
  const [left, lower, right, upper] = bounds;
  const spanX = right - left, spanY = upper - lower;
  if (![left, lower, right, upper, width, height].every(Number.isFinite) ||
      !Number.isFinite(spanX) || !Number.isFinite(spanY) || spanX < 0 || spanY < 0 || width <= 0 || height <= 0)
    throw new Error("Invalid spatial viewport");

  const next = new Int32Array(x.length).fill(-1);
  let groups: SpatialGroup[] = [];
  let mappedCount = 0;
  let minX = Infinity, maxX = -Infinity, minShift = Infinity, maxShift = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let cellPixels = SPATIAL_CELL_PIXELS;
  const divisorX = spanX || 1, divisorY = spanY || 1;
  for (;;) {
    groups = [];
    next.fill(-1);
    mappedCount = 0;
    const cells = new Map<string, number>();
    minX = Infinity; maxX = -Infinity; minShift = Infinity; maxShift = -Infinity;
    minY = Infinity; maxY = -Infinity;
    for (let i = start; i < Math.min(end, x.length, y.length); i++) {
      if ((i - start) % 8192 === 0) await checkpoint();
      const pointX = x[i], pointY = y[i];
      if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) continue;
      mappedCount++;
      minX = Math.min(minX, pointX); maxX = Math.max(maxX, pointX);
      const shiftedX = options.wrapX && pointX < 0.5 ? pointX + 1 : pointX;
      minShift = Math.min(minShift, shiftedX); maxShift = Math.max(maxShift, shiftedX);
      minY = Math.min(minY, pointY); maxY = Math.max(maxY, pointY);

      const displayX = options.wrapX ? pointX + Math.ceil(left - pointX) : pointX;
      if ((spanX < 1 && (displayX < left || displayX > right)) ||
          (spanX >= 1 && (displayX < left || displayX > right)) || pointY < lower || pointY > upper) continue;
      const px = (displayX - left) / divisorX * width;
      const py = options.flipY ? (upper - pointY) / divisorY * height : (pointY - lower) / divisorY * height;
      const cellKey = `${Math.floor(px / cellPixels)},${Math.floor(py / cellPixels)}`;
      let groupIndex = cells.get(cellKey);
      if (groupIndex === undefined) {
        groupIndex = groups.length;
        cells.set(cellKey, groupIndex);
        groups.push({ head: -1, count: 0, x: 0, y: 0 });
      }
      const group = groups[groupIndex];
      next[i] = group.head;
      group.head = i;
      group.count++;
      group.x += displayX;
      group.y += pointY;
    }
    if (groups.length <= MAX_SPATIAL_MARKERS) break;
    cellPixels *= 2;
  }
  if (options.wrapX && maxShift - minShift < maxX - minX) { minX = minShift; maxX = maxShift; }
  return {
    key,
    groups,
    next,
    selectedCount: end - start,
    mappedCount,
    bounds: mappedCount ? [minX, minY, maxX, maxY] : null,
  };
}

/** Shared categorical, numeric and boolean summaries for spatial aggregates. */
export async function summarizeSpatialGroups(
  nodes: Node[],
  tips: MetadataTableIndex,
  index: SpatialAggregationIndex,
  geometry: SpatialGeometry,
  spec: MetadataColorSpec | undefined,
  checkpoint: () => Promise<void>,
): Promise<MetadataDensityField | undefined> {
  if (!spec) return undefined;
  if (index.summary?.geometry === geometry && index.summary.field === spec.field && index.summary.kind === spec.kind)
    return index.summary.result;

  if (spec.kind === "categorical" && index.category?.field !== spec.field) {
    const category = await buildCategoryIndex(tips.tips.length, i => nodes[tips.tips[i]][spec.field], checkpoint);
    index.category = { field: spec.field, index: category };
  }
  const summary: MetadataDensityField = {
    kind: spec.kind,
    totalCounts: Uint32Array.from(geometry.groups, group => group.count),
    ...(spec.kind === "categorical" ? { categoryValues: new Array(geometry.groups.length).fill(null) } :
      spec.kind === "numeric" ? { valueSums: new Float64Array(geometry.groups.length), valueCounts: new Uint32Array(geometry.groups.length) } :
        { trueCounts: new Uint32Array(geometry.groups.length) }),
  };
  for (let groupIndex = 0; groupIndex < geometry.groups.length; groupIndex++) {
    await checkpoint();
    const group = geometry.groups[groupIndex];
    if (summary.categoryValues) {
      summary.categoryValues[groupIndex] = await categoryGroupMode(index.category!.index, group.head, geometry.next, checkpoint);
      continue;
    }
    let visited = 0;
    for (let i = group.head; i !== -1; i = geometry.next[i]) {
      if (visited++ % 8192 === 0) await checkpoint();
      const value = nodes[tips.tips[i]][spec.field];
      if (summary.valueSums && summary.valueCounts) {
        const numeric = numericMetadataValue(value);
        if (numeric !== null) { summary.valueSums[groupIndex] += numeric; summary.valueCounts[groupIndex]++; }
      } else if (summary.trueCounts && TRUE_VALUES.has(normalizeMetadataValue(value))) {
        summary.trueCounts[groupIndex]++;
      }
    }
  }
  index.summary = { geometry, field: spec.field, kind: spec.kind, result: summary };
  return summary;
}

/** Apply the same colour and tooltip rules used by the geographic map. */
export async function renderSpatialMarkers(
  nodes: Node[],
  tips: MetadataTableIndex,
  index: SpatialAggregationIndex,
  geometry: SpatialGeometry,
  options: {
    spec?: MetadataColorSpec;
    color?: RGB;
    fieldLabel?: string;
    nameField?: string;
  },
  checkpoint: () => Promise<void>,
): Promise<SpatialMarker[]> {
  const summary = await summarizeSpatialGroups(nodes, tips, index, geometry, options.spec, checkpoint);
  const color = options.spec ? createMetadataColor(options.spec) : null;
  const fallbackColor = options.color ?? MISSING_COLOR;
  const markers: SpatialMarker[] = [];
  for (let groupIndex = 0; groupIndex < geometry.groups.length; groupIndex++) {
    await checkpoint();
    const group = geometry.groups[groupIndex];
    const headNode = nodes[tips.tips[group.head]];
    const label = (group.count === 1 ? `${metadataValueLabel(headNode[options.nameField ?? "name"])}\n` : "") +
      `${group.count.toLocaleString()} sample${group.count === 1 ? "" : "s"}` +
      (options.spec && summary ? `\n${options.fieldLabel ?? options.spec.field.replace(/^meta_/, "")}: ` +
        `${group.count === 1 ? metadataValueLabel(headNode[options.spec.field]) : densityValueLabel(summary, groupIndex)}` : "");
    markers.push({
      x: group.x / group.count,
      y: group.y / group.count,
      count: group.count,
      color: summary ? aggregateColor(summary, groupIndex, fallbackColor, color) : [...fallbackColor, 255],
      label,
    });
  }
  return markers;
}
