import {
  normalizeNumericValue,
  parseNumericMetadataValue,
} from "./metadataMatrix";

export interface NumericPrefixValues {
  sums: Float64Array;
  counts: Uint32Array;
}

export const buildNumericPrefixValues = (
  values: unknown[]
): NumericPrefixValues => {
  const sums = new Float64Array(values.length + 1);
  const counts = new Uint32Array(values.length + 1);
  values.forEach((value, index) => {
    const numeric = parseNumericMetadataValue(value);
    sums[index + 1] =
      sums[index] + normalizeNumericValue(numeric);
    counts[index + 1] = counts[index] + 1;
  });
  return { sums, counts };
};

export const summarizeNumericPrefixValues = (
  prefix: NumericPrefixValues,
  start: number,
  endExclusive: number
) => {
  const count = prefix.counts[endExclusive] - prefix.counts[start];
  const sum = prefix.sums[endExclusive] - prefix.sums[start];
  return {
    sum,
    count,
    mean: count > 0 ? sum / count : null,
  };
};
