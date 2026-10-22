import type { MetadataDensityField } from "../types/backend";
import type { RGB } from "./metadata";
import { interpolateMetadataColor, normalizeNumericValue } from "./metadataMatrix";

/** Shared final rendering of column rows and geographic groups. */
export function aggregateColor(field: MetadataDensityField, row: number, color: RGB,
  valueColor?: ((value: unknown) => RGB) | null): [number, number, number, number] {
  const total = field.totalCounts[row];
  if (!total) return [0, 0, 0, 0];
  if (field.kind === "categorical" && valueColor) return [...valueColor(field.categoryValues?.[row]), 255];
  if (field.kind === "numeric" && valueColor)
    return [...valueColor(field.valueCounts?.[row] ? field.valueSums![row] / field.valueCounts[row] : null), 255];
  if (field.kind === "numeric" && field.valueSums && field.valueCounts)
    return [...interpolateMetadataColor([244, 244, 244], color,
      normalizeNumericValue(field.valueSums[row] / field.valueCounts[row])), 255];
  return [...color, Math.round(((field.trueCounts?.[row] ?? 0) / total) * 255)];
}
