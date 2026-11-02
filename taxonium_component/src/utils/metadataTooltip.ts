import type { MetadataDensityField } from "../types/backend";
import { isMissingMetadata } from "./metadata";

export const metadataValueLabel = (value: unknown): string =>
  isMissingMetadata(value) ? "Missing" : String(value);

/** Anchor to the left of the pointer and use the roomier vertical direction. */
export function metadataTooltipStyle(
  x: number, y: number, width: number, height: number,
): Partial<CSSStyleDeclaration> {
  const margin = 8;
  const gap = 12;
  const above = y > height / 2;
  const anchorX = Math.max(margin, Math.min(x - gap, width - margin));
  const anchorY = Math.max(margin, Math.min(y + (above ? -gap : gap), height - margin));
  return {
    transform: `translate(calc(${anchorX}px - 100%), ${anchorY}px) translateY(${above ? "-100%" : "0"})`,
    width: "max-content",
    maxWidth: `${Math.max(0, Math.min(320, anchorX - margin))}px`,
    maxHeight: `${Math.max(0, above ? anchorY - margin : height - margin - anchorY)}px`,
    boxSizing: "border-box",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    overflow: "hidden",
  };
}

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

/** Shared appearance for the tree metadata and timeline hover surfaces. */
export const metadataTooltipAppearance = {
  position: "absolute", top: "0", left: "0", pointerEvents: "none", zIndex: "3",
  color: "#a0a7b4", backgroundColor: "#29323c", padding: "10px", fontSize: "12px",
} as const;
