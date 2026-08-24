export type MetadataFieldKind = "boolean" | "numeric";

export interface MetadataFieldInfo {
  kind: MetadataFieldKind;
}

export type MetadataMatrixColor = [number, number, number];

export const TRUE_VALUES = new Set(["true", "1", "yes", "y", "t"]);
export const FALSE_VALUES = new Set(["false", "0", "no", "n", "f", ""]);

export const normalizeMetadataValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim().toLowerCase();
};

export const isBooleanLikeValue = (value: unknown): boolean => {
  const normalized = normalizeMetadataValue(value);
  return TRUE_VALUES.has(normalized) || FALSE_VALUES.has(normalized);
};

export const parseNumericMetadataValue = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const classifyMetadataValues = (
  values: unknown[]
): MetadataFieldInfo | null => {
  let sawValue = false;
  let sawNumeric = false;
  let allBoolean = true;

  for (const value of values) {
    if (normalizeMetadataValue(value) === "") {
      continue;
    }
    sawValue = true;
    if (!isBooleanLikeValue(value)) {
      allBoolean = false;
    }
    const numeric = parseNumericMetadataValue(value);
    if (numeric !== null) {
      sawNumeric = true;
    }
  }

  if (!sawValue || (!allBoolean && !sawNumeric)) {
    return null;
  }
  if (allBoolean) {
    return { kind: "boolean" };
  }
  return { kind: "numeric" };
};

export const normalizeNumericValue = (
  value: unknown
): number => {
  const numeric = parseNumericMetadataValue(value);
  return Math.max(0, Math.min(1, numeric ?? 0));
};

export const interpolateMetadataColor = (
  low: MetadataMatrixColor,
  high: MetadataMatrixColor,
  fraction: number
): MetadataMatrixColor => {
  const clamped = Math.max(0, Math.min(1, fraction));
  return [
    Math.round(low[0] + (high[0] - low[0]) * clamped),
    Math.round(low[1] + (high[1] - low[1]) * clamped),
    Math.round(low[2] + (high[2] - low[2]) * clamped),
  ];
};
