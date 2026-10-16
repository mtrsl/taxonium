import { describe, it, expect } from "vitest";
import { categoricalMode, createMetadataColor, metadataLegendRamp, MISSING_COLOR,
  numericMetadataValue, resolveMetadataSpec, sanitizeMetadataOverrides, summarizeMetadata } from "./metadata";
import { formatMetadataMatrixHoverValue } from "./metadataMatrix";

const summary = { kind: "categorical" as const, min: -10, max: 20 };
const spec = resolveMetadataSpec("meta_id", summary, undefined);

describe("metadata interpretation", () => {
  it("keeps identifiers and mixed strings categorical while recording numeric override ranges", () => {
    expect(summarizeMetadata(["001", "2", "9", null])).toEqual({ kind: "categorical", min: 1, max: 9 });
    expect(summarizeMetadata([-10, 5, 20, null])).toEqual({ kind: "numeric", min: -10, max: 20 });
    expect(summarizeMetadata(["true", "false", "1", ""])).toEqual({ kind: "boolean", min: 1, max: 1 });
    expect(summarizeMetadata(["", undefined, "NA"])).toEqual({ kind: "categorical" });
    expect(summarizeMetadata([2, "invalid"])).toEqual({ kind: "categorical", min: 2, max: 2 });
  });
  it("resolves overrides before configured types and ramps", () => {
    const ramp = { scale: [[0, "red"], [10, "blue"]] as [number, string][] };
    expect(resolveMetadataSpec("meta_id", summary, undefined, {}, ramp).kind).toBe("numeric");
    expect(resolveMetadataSpec("meta_id", summary, { kind: "numeric" }, { type: "categorical" }, ramp)).toMatchObject({ kind: "categorical", ramp: undefined });
    expect(resolveMetadataSpec("meta_id", summary, { kind: "numeric" }).kind).toBe("numeric");
  });
  it("parses complete finite numeric strings only and preserves categorical display", () => {
    for (const value of [null, "", " ", "NA", "unknown", "2units", Infinity, true, [], {}]) expect(numericMetadataValue(value)).toBeNull();
    expect(numericMetadataValue(" -2.5e1 ")).toBe(-25);
    expect(formatMetadataMatrixHoverValue("categorical", "001")).toBe("001");
  });
});

describe("shared colours", () => {
  it("is stable across ordering, filtering, repeated instances and large category counts", () => {
    const color = createMetadataColor(spec);
    const expected = Array.from({ length: 12000 }, (_, i) => color(String(i)));
    const other = createMetadataColor(spec);
    for (let i = 11999; i >= 0; i--) expect(other(String(i))).toEqual(expected[i]);
    expect(color("001")).not.toEqual(color("1"));
    expect(color("A")).not.toEqual(color("a"));
    expect(createMetadataColor({ ...spec, field: "meta_other" })("001")).not.toEqual(color("001"));
  });
  it("replaces configured and manual colours on reshuffle for only the chosen field", () => {
    const configured = { A: [1, 2, 3] as [number, number, number] };
    const before = resolveMetadataSpec("meta_id", summary, undefined, { colors: { B: [4, 5, 6] } }, undefined, configured);
    expect(createMetadataColor(before)("A")).toEqual([1, 2, 3]);
    expect(createMetadataColor(before)("B")).toEqual([4, 5, 6]);
    const after = resolveMetadataSpec("meta_id", summary, undefined, { seed: 123, colors: {} }, undefined, configured);
    expect(createMetadataColor(after)("A")).not.toEqual([1, 2, 3]);
    expect(createMetadataColor(after)("B")).not.toEqual([4, 5, 6]);
    expect(createMetadataColor({ ...after, colors: { A: [7, 8, 9] } })("A")).toEqual([7, 8, 9]);
    expect(createMetadataColor(before)("A")).toEqual([1, 2, 3]);
  });
  it("maps arbitrary numeric ranges and missing values consistently with the legend", () => {
    const numeric = { ...spec, kind: "numeric" as const };
    const color = createMetadataColor(numeric);
    expect(color(-10)).not.toEqual(color(20));
    expect(color("-10")).toEqual(color(-10));
    for (const value of [null, "", "NA", "bad", NaN]) expect(color(value)).toEqual(MISSING_COLOR);
    for (const [value, css] of metadataLegendRamp(numeric)!.scale) expect(css).toBe(`rgb(${color(value).join(",")})`);
    expect(metadataLegendRamp({ ...numeric, min: 2, max: 2 })!.scale).toHaveLength(1);
    expect(createMetadataColor({ ...numeric, min: undefined, max: undefined })(2)).toEqual(MISSING_COLOR);
  });
  it("honours configured ramps and lets explicit categorical overrides bypass them", () => {
    const ramp = { scale: [[-10, "#000000"], [20, "#ffffff"]] as [number, string][] };
    const numeric = resolveMetadataSpec("meta_id", summary, undefined, {}, ramp);
    expect(createMetadataColor(numeric)(5)).toEqual([128, 128, 128]);
    expect(createMetadataColor(numeric)(100)).toEqual([255, 255, 255]);
    expect(metadataLegendRamp(numeric)).toEqual(ramp);
    expect(metadataLegendRamp(spec)).toBeUndefined();
  });
  it("handles prototype-like category names safely", () => {
    expect(createMetadataColor(spec)("__proto__")).toHaveLength(3);
    expect(createMetadataColor(spec)("constructor")).toHaveLength(3);
  });
});

describe("URL settings and aggregation", () => {
  it("round-trips settings and rejects malformed entries", () => {
    const state = { meta_id: { type: "categorical", seed: 42, colors: { "001": [1, 2, 3] } } };
    expect(sanitizeMetadataOverrides(JSON.stringify(state))).toEqual(state);
    for (const raw of ["{", "null", "[]"]) expect(sanitizeMetadataOverrides(raw)).toEqual({});
    expect(sanitizeMetadataOverrides('{"meta_id":{"type":"bad","seed":-2,"colors":{"A":[-1,300,2.4],"B":[1]}}}')).toEqual({ meta_id: { colors: { A: [0,255,2] } } });
    const restored = sanitizeMetadataOverrides(JSON.stringify(state));
    expect(createMetadataColor(resolveMetadataSpec("meta_id", summary, undefined, restored.meta_id))("001")).toEqual([1, 2, 3]);
  });
  it("selects the non-missing categorical mode with lexical tie breaks", () => {
    expect(categoricalMode(["B", "A", "B", null, "NA"])).toBe("B");
    expect(categoricalMode(["B", "A"])).toBe("A");
    expect(categoricalMode(["A", "B"])).toBe("A");
    expect(categoricalMode(["001", "1"])).toBe("001");
    expect(categoricalMode([null, "NA", ""])).toBeNull();
  });
});
