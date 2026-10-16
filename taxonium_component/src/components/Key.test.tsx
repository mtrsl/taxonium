import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import Key from "./Key";
import { metadataLegendRamp } from "../utils/metadata";

const props = { keyStuff: [], colorByField: "meta_score", config: {},
  setCurrentColorSettingKey: vi.fn(), setColorSettingOpen: vi.fn(),
  hoveredKey: null, setHoveredKey: vi.fn() };
describe("numeric metadata legend", () => {
  it("shows an empty numeric field even when there are no categorical entries", () => {
    expect(renderToStaticMarkup(<Key {...props} numericEmpty />)).toContain("No valid numeric values");
  });
  it("renders a constant range without NaN labels or an invalid one-stop gradient", () => {
    const ramp = metadataLegendRamp({ field: "meta_score", kind: "numeric", min: 4, max: 4 })!;
    const html = renderToStaticMarkup(<Key {...props} colorRamps={{ meta_score: ramp }} />);
    expect(html).toContain("4.00");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("linear-gradient");
  });
});
