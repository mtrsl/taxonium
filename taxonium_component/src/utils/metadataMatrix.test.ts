import {
  classifyMetadataValues,
  interpolateMetadataColor,
  normalizeNumericValue,
  normalizeMetadataMatrixColumnWidth,
  parseNumericMetadataValue,
} from "./metadataMatrix";
import {
  buildNumericPrefixValues,
  summarizeNumericPrefixValues,
} from "./metadataDensity";
import { describe, expect, it } from "vitest";

describe("metadata matrix field classification", () => {
  it("normalizes metadata lane widths to the supported range", () => {
    expect(normalizeMetadataMatrixColumnWidth(undefined)).toBe(24);
    expect(normalizeMetadataMatrixColumnWidth("invalid")).toBe(24);
    expect(normalizeMetadataMatrixColumnWidth(1)).toBe(12);
    expect(normalizeMetadataMatrixColumnWidth(80.4)).toBe(80);
    expect(normalizeMetadataMatrixColumnWidth(100)).toBe(80);
  });

  it("keeps boolean-like fields boolean", () => {
    expect(classifyMetadataValues(["true", "false", "", "1"])).toEqual({
      kind: "boolean",
    });
  });

  it("classifies finite numeric strings and records their range", () => {
    expect(classifyMetadataValues(["-2", 4, " 8.5 ", ""])).toEqual({
      kind: "numeric",
    });
  });

  it("treats invalid values in an otherwise numeric field as missing", () => {
    expect(classifyMetadataValues(["2", "unknown", ""])).toEqual({
      kind: "numeric",
    });
    expect(classifyMetadataValues(["unknown", ""])).toBeNull();
    expect(parseNumericMetadataValue("not a number")).toBeNull();
  });
});

describe("numeric metadata density", () => {
  it("includes zero-filled missing values in the bin mean", () => {
    const prefix = buildNumericPrefixValues([1, "", "invalid", "5", 9]);

    expect(summarizeNumericPrefixValues(prefix, 0, 3)).toEqual({
      sum: 1,
      count: 3,
      mean: 1 / 3,
    });
    expect(summarizeNumericPrefixValues(prefix, 3, 5)).toEqual({
      sum: 2,
      count: 2,
      mean: 1,
    });
    expect(summarizeNumericPrefixValues(prefix, 1, 3)).toEqual({
      sum: 0,
      count: 2,
      mean: 0,
    });
  });

  it("normalizes every numeric field to the fixed [0, 1] scale", () => {
    expect(normalizeNumericValue(0)).toBe(0);
    expect(normalizeNumericValue(0.5)).toBe(0.5);
    expect(normalizeNumericValue(100)).toBe(1);
    expect(normalizeNumericValue(-10)).toBe(0);
    expect(normalizeNumericValue("missing")).toBe(0);
  });

  it("interpolates from the neutral colour to the field colour", () => {
    expect(interpolateMetadataColor([244, 244, 244], [44, 88, 132], 0.5)).toEqual([
      144,
      166,
      188,
    ]);
  });
});
