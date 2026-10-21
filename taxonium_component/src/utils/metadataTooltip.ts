import type { MetadataDensityField } from "../types/backend";
import { isMissingMetadata } from "./metadata";

export const metadataValueLabel = (value: unknown): string =>
  isMissingMetadata(value) ? "Missing" : String(value);

/** Uses exactly the row summaries consumed by the density renderer. */
export function densityValueLabel(field: MetadataDensityField, row: number): string | null {
  const total = field.totalCounts[row];
  if (!total) return null;
  if (field.kind === "categorical") {
    return field.categoryValues ? `Mode: ${metadataValueLabel(field.categoryValues[row])} (aggregate)`
      : "Category summary unavailable";
  }
  if (field.valueSums) {
    const count = field.valueCounts?.[row] ?? total;
    return `Mean: ${count ? field.valueSums[row] / count : "Missing"} (aggregate)`;
  }
  if (field.trueCounts) {
    return `True: ${field.trueCounts[row]} / ${total} (${(100 * field.trueCounts[row] / total).toFixed(1)}%, aggregate)`;
  }
  return "Summary unavailable";
}
