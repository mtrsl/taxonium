import { describe, expect, it } from "vitest";
import { buildCategoryIndex, categoryRangeMode } from "./categoricalDensity";
import { categoricalMode } from "./metadata";
import { densityValueLabel } from "./metadataTooltip";

describe("exact encoded density", () => {
  it("matches reference modes across ranges, ties, missing values and reused counters", async () => {
    const values = [null, "NA", "", "001", "1", "B", "A", false, 0];
    const rows = Array.from({ length: 900 }, (_, i) => values[(i * 13) % values.length]);
    const index = await buildCategoryIndex(rows.length, i => rows[i], async () => {});
    for (let start = 0; start < rows.length; start += 17) {
      for (const length of [0, 1, 2, 31, 400]) {
        const end = Math.min(rows.length, start + length);
        expect(categoryRangeMode(index, start, end)).toBe(categoricalMode(rows.slice(start, end)));
      }
    }
  });
  it("allows interruption while building a large field", async () => {
    let checkpoints = 0;
    await expect(buildCategoryIndex(150000, i => String(i), async () => {
      if (++checkpoints === 2) throw new Error("cancelled");
    })).rejects.toThrow("cancelled");
    expect(checkpoints).toBe(2);
  });
  it("describes the rendered aggregate and accepts legacy HTTP arrays", () => {
    expect(densityValueLabel({ kind: "categorical", totalCounts: [3], categoryValues: ["A"] }, 0)).toBe("Mode: A (aggregate)");
    expect(densityValueLabel({ kind: "categorical", totalCounts: [3], categoryValues: [null] }, 0)).toBe("Mode: Missing (aggregate)");
    expect(densityValueLabel({ kind: "numeric", totalCounts: [3], valueSums: [12], valueCounts: [2] }, 0)).toBe("Mean: 6 (aggregate)");
    expect(densityValueLabel({ totalCounts: [3], valueSums: [12] }, 0)).toBe("Mean: 4 (aggregate)");
    expect(densityValueLabel({ totalCounts: [4], trueCounts: [1] }, 0)).toBe("True: 1 / 4 (25.0%, aggregate)");
    expect(densityValueLabel({ kind: "categorical", totalCounts: [1] }, 0)).toBe("Category summary unavailable");
    expect(densityValueLabel({ totalCounts: [0] }, 0)).toBeNull();
  });
});
