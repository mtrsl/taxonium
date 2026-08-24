import {
  classifyMetadataValues,
  interpolateMetadataColor,
  normalizeNumericValue,
  parseNumericMetadataValue,
} from "./metadataMatrix";
import {
  buildNumericPrefixValues,
  summarizeNumericPrefixValues,
} from "./metadataDensity";
import { describe, expect, it } from "vitest";

describe("metadata matrix field classification", () => {
  it("keeps boolean-like fields boolean", () => {
    expect(classifyMetadataValues(["true", "false", "", "1"])).toEqual({
      kind: "boolean",
    });
  });

  it("classifies finite numeric strings and records their range", () => {
    expect(classifyMetadataValues(["-2", 4, " 8.5 ", ""])).toEqual({
      kind: "numeric",
      min: -2,
      max: 8.5,
    });
  });

  it("treats invalid values in an otherwise numeric field as missing", () => {
    expect(classifyMetadataValues(["2", "unknown", ""])).toEqual({
      kind: "numeric",
      min: 2,
      max: 2,
    });
    expect(classifyMetadataValues(["unknown", ""])).toBeNull();
    expect(parseNumericMetadataValue("not a number")).toBeNull();
  });
});

describe("numeric metadata density", () => {
  it("excludes missing values from the bin mean", () => {
    const prefix = buildNumericPrefixValues([1, "", "invalid", "5", 9]);

    expect(summarizeNumericPrefixValues(prefix, 0, 3)).toEqual({
      sum: 1,
      count: 1,
      mean: 1,
    });
    expect(summarizeNumericPrefixValues(prefix, 3, 5)).toEqual({
      sum: 14,
      count: 2,
      mean: 7,
    });
    expect(summarizeNumericPrefixValues(prefix, 1, 3)).toEqual({
      sum: 0,
      count: 0,
      mean: null,
    });
  });

  it("normalizes stable dataset-wide ranges", () => {
    expect(normalizeNumericValue(0, -10, 10)).toBe(0.5);
    expect(normalizeNumericValue(100, 10, 10)).toBe(1);
    expect(normalizeNumericValue("missing", 0, 10)).toBeNull();
  });

  it("interpolates from the neutral colour to the field colour", () => {
    expect(interpolateMetadataColor([244, 244, 244], [44, 88, 132], 0.5)).toEqual([
      144,
      166,
      188,
    ]);
  });
});
