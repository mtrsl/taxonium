import { expect, it } from "vitest";
import { minimalBasemap } from "./minimalBasemap";
import type { StyleSpecification } from "maplibre-gl";
it("keeps provider attribution and country filters while removing decorative layers and assets", () => {
  const boundary = { id: "boundary_2", type: "line", source: "tiles", "source-layer": "boundary", filter: ["==", ["get", "admin_level"], 2] };
  const style = { version: 8, sources: { tiles: { type: "vector", url: "tiles", attribution: "Provider attribution" }, unused: { type: "vector", url: "unused" } }, glyphs: "fonts", sprite: "icons",
    layers: [boundary, { id: "water", type: "fill", source: "tiles", "source-layer": "water" }, { id: "roads", type: "line", source: "tiles" }] } as StyleSpecification;
  const result = minimalBasemap(style);
  expect(result.layers.map(l => l.id)).toEqual(["background", "boundary_2", "water"]);
  expect(("filter" in result.layers[1] ? result.layers[1].filter : null)).toEqual(boundary.filter);
  expect(result.sources).toEqual({ tiles: style.sources.tiles });
  expect(result.glyphs).toBeUndefined(); expect(result.sprite).toBeUndefined();
  expect(() => minimalBasemap({ version: 8, sources: {}, layers: [] })).toThrow("boundaries");
});
