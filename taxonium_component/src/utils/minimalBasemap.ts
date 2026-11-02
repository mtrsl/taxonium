import type { StyleSpecification } from "maplibre-gl";

/** Keep the existing provider's sources, attribution and political boundary filters. */
export function minimalBasemap(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.filter(layer => layer.id === "water" || layer.id === "boundary_2" || layer.id === "boundary_disputed");
  if (!layers.some(layer => layer.id === "boundary_2")) throw new Error("Country boundaries unavailable");
  const sources = new Set(layers.flatMap(layer => "source" in layer ? [layer.source] : []));
  return { version: 8, sources: Object.fromEntries(Object.entries(style.sources).filter(([key]) => sources.has(key))),
    layers: [{ id: "background", type: "background", paint: { "background-color": "#fafafa" } },
      ...layers.map(layer => layer.type === "fill" ? { ...layer, paint: { "fill-color": "#f1f5f9", "fill-outline-color": "#cbd5e1" } } :
        layer.type === "line" ? { ...layer, paint: { ...layer.paint, "line-color": "#94a3b8", "line-width": 1 } } : layer)] };
}
