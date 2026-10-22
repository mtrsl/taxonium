import type { Node } from "../types/node";
import type { GeographicRequest, GeographicPage } from "../types/geography";
import type { MetadataTableIndex } from "./metadataTable";
import { selectedTipRange } from "./metadataTable";
import { numericMetadataValue } from "./metadata";
import { buildSpatialGeometry, renderSpatialMarkers, MAX_SPATIAL_MARKERS, type SpatialAggregationIndex } from "./spatialAggregation";

export const MAX_GEOGRAPHIC_POINTS = MAX_SPATIAL_MARKERS;
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

export interface GeographicIndex extends SpatialAggregationIndex {
  x: Float64Array;
  y: Float64Array;
  available: boolean;
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
  const [west, south, east, north] = request.bounds;
  const left = (west + 180) / 360, right = (east + 180) / 360 + (east < west ? 1 : 0);
  const top = projectY(north), bottom = projectY(south);
  const key = JSON.stringify([start, end, request.bounds, request.zoom, request.width, request.height]);
  let geometry = index.geometry;
  if (!geometry || geometry.key !== key) {
    geometry = await buildSpatialGeometry(index.x, index.y, start, end, [left, top, right, bottom],
      request.width, request.height, key, checkpoint, { wrapX: true });
    index.geometry = geometry;
    index.summary = undefined;
  }
  const markers = await renderSpatialMarkers(nodes, tips, index, geometry, {
    spec: request.colorSpec,
    color: request.color,
    fieldLabel: request.fieldLabel,
    nameField: request.nameField,
  }, checkpoint);
  const points = markers.map(marker => ({
    longitude: wrap(marker.x) * 360 - 180,
    latitude: unprojectY(marker.y),
    count: marker.count,
    color: marker.color,
    label: marker.label,
  }));
  const bounds = geometry.bounds ? [geometry.bounds[0] * 360 - 180, unprojectY(geometry.bounds[3]),
    geometry.bounds[2] * 360 - 180, unprojectY(geometry.bounds[1])] as GeographicPage["bounds"] : null;
  return { points, selectedCount: geometry.selectedCount, mappedCount: geometry.mappedCount,
    bounds, available: index.available };
}
