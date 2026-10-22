import prettifyName from "../utils/prettifyName";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LibreMap, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { GeographicPage, GeographicRequest } from "../types/geography";
import { coordinateFields } from "../utils/geography";
import { metadataTooltipStyle } from "../utils/metadataTooltip";
import { NEUTRAL_METADATA_COLOR } from "../utils/metadata";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  backend: LocalBackend;
  config: Config;
  selectedNodeId: string | number | null;
  field: string;
  metadataMatrix: MetadataMatrix;
  active: boolean;
}
const blankStyle: StyleSpecification = { version: 8, sources: {}, layers: [
  { id: "background", type: "background", paint: { "background-color": "#edf2f4" } },
] };
const initialViewport = { bounds: [-180, -85.051129, 180, 85.051129] as GeographicRequest["bounds"], zoom: 0, width: 800, height: 400 };

export default function GeographicMapPanel({ backend, config, selectedNodeId, field, metadataMatrix, active }: Props) {
  const available = !!coordinateFields(Object.keys(config.metadataSummaries ?? {}));
  const [viewport, setViewport] = useState(initialViewport);
  const [page, setPage] = useState<GeographicPage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [tileError, setTileError] = useState(false);
  const [retry, setRetry] = useState(0);
  const container = useRef<HTMLDivElement>(null), tooltip = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const pageRef = useRef(page); pageRef.current = page;
  const fitPending = useRef(true);
  const pageSelection = useRef<string | null>(null);
  const camera = useRef<{ center: [number, number]; zoom: number }>({ center: [0, 0], zoom: 0 });
  const spec = metadataMatrix.metadata?.specs[field];
  const color = field === "genotype" ? NEUTRAL_METADATA_COLOR : metadataMatrix.getFieldColor(field);
  const fieldLabel = prettifyName(field, config);
  const nameField = String(config.name_accessor ?? "name");
  const selectionKey = selectedNodeId === null ? "all" : `${typeof selectedNodeId}:${selectedNodeId}`;
  const request = useMemo<GeographicRequest>(() => ({ ...viewport, selectedNodeId, colorSpec: spec, color, fieldLabel, nameField }),
    [viewport, selectedNodeId, spec, color[0], color[1], color[2], fieldLabel, nameField]);

  useEffect(() => {
    fitPending.current = true;
    pageSelection.current = null;
    setPage(undefined);
  }, [selectionKey]);
  useEffect(() => {
    if (!active || !available || !backend.queryGeography) return;
    let current = true;
    setBusy(true); setError("");
    const cancel = backend.queryGeography(request, result => {
      if (!current) return;
      setBusy(false);
      if ("error" in result) setError(result.error);
      else if (!("cancelled" in result)) { pageSelection.current = selectionKey; setPage(result); }
    });
    return () => { current = false; cancel(); };
  }, [backend.queryGeography, request, active, available, retry, selectionKey]);

  const fit = () => {
    const bounds = pageRef.current?.bounds;
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, maxZoom: 12, duration: 0 });
      fitPending.current = false;
    }
  };
  const updateSource = () => {
    const map = mapRef.current, current = pageRef.current;
    if (!map || !current) return;
    const source = map.getSource("samples") as GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: current.points.map((point, id) => ({
      type: "Feature", id, geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
      properties: { count: point.count, label: point.label, color: `rgb(${point.color.slice(0, 3).join(",")})`, opacity: point.color[3] / 255 },
    })) });
  };
  const hasPoints = !!page?.mappedCount;
  useEffect(() => {
    if (!active || !available || !hasPoints || !container.current) return;
    let disposed = false;
    let map: LibreMap | undefined, observer: ResizeObserver | undefined, workerUrl: string | undefined;
    const abort = new AbortController();
    setMapError(""); setTileError(false);
    const timeout = setTimeout(() => abort.abort(), 15000);
    void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?raw")])
      .then(async ([{ Map, NavigationControl, setWorkerUrl }, { default: workerSource }]) => {
      if (disposed || !container.current) return;
      // A blob keeps the library portable when embedded under another app's base URL.
      workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
      setWorkerUrl(workerUrl);
      map = new Map({ container: container.current, style: blankStyle, ...camera.current,
        attributionControl: { compact: true }, renderWorldCopies: true, dragRotate: false, pitchWithRotate: false });
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.touchZoomRotate.disableRotation();
      const updateViewport = () => {
        if (!map || disposed || !map.getContainer().clientWidth || !map.getContainer().clientHeight) return;
        const b = map.getBounds();
        camera.current = { center: map.getCenter().toArray(), zoom: map.getZoom() };
        setViewport({ bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom(),
          width: Math.max(1, map.getContainer().clientWidth), height: Math.max(1, map.getContainer().clientHeight) });
        if (tooltip.current) tooltip.current.hidden = true;
      };
      map.on("moveend", updateViewport);
      map.on("style.load", () => {
        if (!map || disposed) return;
        map.addSource("samples", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "samples", type: "circle", source: "samples", paint: {
          "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 5, 30, 18],
          "circle-color": ["get", "color"], "circle-opacity": ["get", "opacity"],
          "circle-stroke-color": "#fff", "circle-stroke-width": 1,
        } });
        updateSource();
        if (fitPending.current) fit();
        updateViewport();
      });
      map.on("mousemove", "samples", event => {
        const el = tooltip.current;
        if (disposed || !el || !map) return;
        el.textContent = String(event.features?.[0]?.properties?.label ?? "");
        Object.assign(el.style, metadataTooltipStyle(event.point.x, event.point.y, map.getContainer().clientWidth, map.getContainer().clientHeight));
        el.hidden = false;
      });
      map.on("mouseleave", "samples", () => { if (!disposed && tooltip.current) tooltip.current.hidden = true; });
      map.on("click", "samples", event => {
        const feature = event.features?.[0];
        if (!disposed && map && feature?.geometry.type === "Point" && Number(feature.properties?.count) > 1)
          map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.min(18, map.getZoom() + 2) });
      });
      let fallback = false;
      map.on("error", () => {
        if (!disposed && map && !fallback) { fallback = true; setTileError(true); map.setStyle(blankStyle); }
      });
      observer = new ResizeObserver(() => {
        if (disposed || !container.current?.clientWidth || !container.current.clientHeight) return;
        map?.resize(); updateViewport();
      });
      observer.observe(container.current);
      try {
        const response = await fetch("https://tiles.openfreemap.org/styles/liberty", { signal: abort.signal });
        if (!response.ok) throw new Error("Basemap unavailable");
        const style = await response.json() as StyleSpecification;
        if (!disposed && !fallback) map.setStyle(style);
      } catch { if (!disposed) setTileError(true); }
      finally { clearTimeout(timeout); }
    }).catch(err => { if (!disposed) setMapError(`Unable to initialise map: ${String(err)}`); });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      abort.abort();
      observer?.disconnect();
      if (map) camera.current = { center: map.getCenter().toArray(), zoom: map.getZoom() };
      map?.remove();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      mapRef.current = null;
    };
  }, [active, available, hasPoints, retry]);

  useEffect(() => {
    if (pageSelection.current !== selectionKey) return;
    updateSource();
    if (fitPending.current) fit();
    if (tooltip.current) tooltip.current.hidden = true;
  }, [page, selectionKey]);

  return <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
    <div style={{ display: "flex", gap: 12, padding: "6px 12px", alignItems: "center", flexWrap: "wrap" }}>
      <span role="status">{!available ? "No latitude/longitude columns available." : busy ? "Updating map…" : page ?
        `${page.mappedCount.toLocaleString()} of ${page.selectedCount.toLocaleString()} selected samples mapped` : "Loading map…"}</span>
      <button type="button" onClick={fit} disabled={!page?.bounds}>Fit selection</button>
      <span>{field === "genotype" ? "Neutral points: genotype colouring is not supported on the map." : spec ? `Colour: ${fieldLabel}` : "Uncoloured points"}</span>
    </div>
    {(error || mapError) && <div role="alert">{error || mapError} <button onClick={() => setRetry(n => n + 1)}>Retry map</button></div>}
    {available && page && !page.mappedCount && <p style={{ padding: 12 }}>No valid coordinates in the selected samples.</p>}
    {tileError && <p role="status" style={{ padding: "0 12px" }}>Basemap unavailable; samples are shown on a plain background.</p>}
    {active && available && hasPoints && <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div ref={container} aria-label="Sample locations" style={{ position: "absolute", inset: 0 }} />
      <div ref={tooltip} role="tooltip" hidden style={{ position: "absolute", left: 0, top: 0, zIndex: 2,
        pointerEvents: "none", padding: 8, borderRadius: 4, color: "white", background: "#111827", fontSize: 12 }} />
    </div>}
  </div>;
}
