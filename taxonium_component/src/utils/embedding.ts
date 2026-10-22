import type { Node } from "../types/node";
import type { EmbeddingDiagnostics, EmbeddingPage, EmbeddingRequest } from "../types/embedding";
import type { MetadataTableIndex } from "./metadataTable";
import { selectedTipRange } from "./metadataTable";
import { parseDotCoordinates } from "./dotEmbedding";
import { buildSpatialGeometry, renderSpatialMarkers, type SpatialAggregationIndex } from "./spatialAggregation";

export interface EmbeddingIndex extends SpatialAggregationIndex {
  x: Float64Array;
  y: Float64Array;
  diagnostics: EmbeddingDiagnostics;
}

export function buildEmbeddingIndex(nodes: Node[], tips: MetadataTableIndex, source: string,
  nameField: string, checkpoint: () => Promise<void>): Promise<EmbeddingIndex> {
  return buildEmbeddingIndexAsync(nodes, tips, source, nameField, checkpoint);
}

async function buildEmbeddingIndexAsync(nodes: Node[], tips: MetadataTableIndex, source: string,
  nameField: string, checkpoint: () => Promise<void>): Promise<EmbeddingIndex> {
  const parsed = await parseDotCoordinates(source, checkpoint);
  const firstByName = new Map<string, number>();
  const duplicates = new Map<string, number[]>();
  for (let tip = 0; tip < tips.tips.length; tip++) {
    if (tip % 8192 === 0) await checkpoint();
    const rawName = nodes[tips.tips[tip]][nameField];
    if (rawName === null || rawName === undefined) continue;
    const name = typeof rawName === "string" ? rawName : String(rawName);
    const first = firstByName.get(name);
    if (first === undefined) firstByName.set(name, tip);
    else {
      let matches = duplicates.get(name);
      if (!matches) { matches = [first]; duplicates.set(name, matches); }
      matches.push(tip);
    }
  }

  const x = new Float64Array(tips.tips.length).fill(NaN);
  const y = new Float64Array(tips.tips.length).fill(NaN);
  let matchedSamples = 0, unmatchedIdentifiers = 0, maxAbs = 0;
  let checked = 0;
  for (const [name, coordinate] of parsed.coordinates) {
    if (checked++ % 8192 === 0) await checkpoint();
    const first = firstByName.get(name);
    if (first === undefined) { unmatchedIdentifiers++; continue; }
    const targets = duplicates.get(name) ?? [first];
    for (const tip of targets) {
      x[tip] = coordinate.x;
      y[tip] = coordinate.y;
      matchedSamples++;
      maxAbs = Math.max(maxAbs, Math.abs(coordinate.x), Math.abs(coordinate.y));
    }
  }
  const scale = maxAbs || 1;
  if (scale !== 1) {
    for (let tip = 0; tip < x.length; tip++) {
      if (tip % 8192 === 0) await checkpoint();
      if (Number.isFinite(x[tip])) { x[tip] /= scale; y[tip] /= scale; }
    }
  }
  return {
    x, y,
    diagnostics: {
      supplied: true,
      available: matchedSamples > 0,
      matchedSamples,
      invalidCoordinateRecords: parsed.invalidCoordinateRecords,
      unmatchedIdentifiers,
    },
  };
}

export async function queryEmbedding(nodes: Node[], tips: MetadataTableIndex, index: EmbeddingIndex,
  request: EmbeddingRequest, checkpoint: () => Promise<void>): Promise<EmbeddingPage> {
  if (!request.bounds.every(Number.isFinite) || !Number.isFinite(request.width) || !Number.isFinite(request.height) ||
      request.width <= 0 || request.height <= 0) throw new Error("Invalid embedding viewport");
  if (!index.diagnostics.available) throw new Error("No usable DOT coordinates matched tree tips");
  const [start, end] = selectedTipRange(nodes, tips, request.selectedNodeId);
  const key = JSON.stringify([start, end, request.bounds, request.width, request.height]);
  let geometry = index.geometry;
  if (!geometry || geometry.key !== key) {
    geometry = await buildSpatialGeometry(index.x, index.y, start, end, request.bounds,
      request.width, request.height, key, checkpoint, { flipY: true });
    index.geometry = geometry;
    index.summary = undefined;
  }
  const points = await renderSpatialMarkers(nodes, tips, index, geometry, {
    spec: request.colorSpec,
    color: request.color,
    fieldLabel: request.fieldLabel,
    nameField: request.nameField,
  }, checkpoint);
  return { points, selectedCount: geometry.selectedCount, matchedCount: geometry.mappedCount, bounds: geometry.bounds };
}
