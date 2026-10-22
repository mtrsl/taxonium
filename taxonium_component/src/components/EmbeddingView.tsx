import { OrthographicView } from "@deck.gl/core";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { EmbeddingPage, EmbeddingRequest } from "../types/embedding";
import prettifyName from "../utils/prettifyName";
import { metadataTooltipStyle } from "../utils/metadataTooltip";
import { NEUTRAL_METADATA_COLOR } from "../utils/metadata";

interface Props {
  backend: LocalBackend;
  config: Config;
  selectedNodeId: string | number | null;
  field: string;
  metadataMatrix: MetadataMatrix;
  active: boolean;
}

interface Camera {
  target: [number, number, number];
  zoom: number;
}

const initialBounds: EmbeddingRequest["bounds"] = [-2, -2, 2, 2];
const buttonClass = "tx-button border border-gray-400 shadow-xs rounded-sm py-1 px-2 bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed";
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export default function EmbeddingView({ backend, config, selectedNodeId, field, metadataMatrix, active }: Props) {
  const diagnostics = config.embeddingDiagnostics;
  const [camera, setCamera] = useState<Camera>({ target: [0, 0, 0], zoom: 1 });
  const activeRef = useRef(active); activeRef.current = active;
  const [size, setSize] = useState({ width: 800, height: 400 });
  const [viewport, setViewport] = useState({ bounds: initialBounds, width: 800, height: 400 });
  const [page, setPage] = useState<EmbeddingPage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const pageRef = useRef(page); pageRef.current = page;
  const fitPending = useRef(true);
  const pageSelection = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spec = metadataMatrix.metadata?.specs[field];
  const color = field === "genotype" ? NEUTRAL_METADATA_COLOR : metadataMatrix.getFieldColor(field);
  const fieldLabel = prettifyName(field, config);
  const nameField = String(config.name_accessor ?? "name");
  const selectionKey = selectedNodeId === null ? "all" : `${typeof selectedNodeId}:${selectedNodeId}`;
  const request = useMemo<EmbeddingRequest>(() => ({ ...viewport, selectedNodeId, colorSpec: spec, color, fieldLabel, nameField }),
    [viewport, selectedNodeId, spec, color[0], color[1], color[2], fieldLabel, nameField]);
  const hasPoints = !!page?.matchedCount;

  useEffect(() => {
    if (!active || !diagnostics?.available || !hasPoints) return;
    const element = container.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth > 0 && element.clientHeight > 0)
        setSize({ width: element.clientWidth, height: element.clientHeight });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [active, diagnostics?.available, hasPoints]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) return;
    timer.current = setTimeout(() => {
      const scale = 2 ** clamp(camera.zoom, -20, 20);
      const halfWidth = size.width / scale / 2, halfHeight = size.height / scale / 2;
      setViewport({
        bounds: [camera.target[0] - halfWidth, camera.target[1] - halfHeight,
          camera.target[0] + halfWidth, camera.target[1] + halfHeight],
        width: size.width,
        height: size.height,
      });
    }, 70);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [active, camera, size]);

  useEffect(() => { if (!active) setHover(null); }, [active]);

  useEffect(() => {
    fitPending.current = true;
    pageSelection.current = null;
    setPage(undefined);
    setHover(null);
  }, [selectionKey]);

  useEffect(() => {
    if (!active || !diagnostics?.available || !backend.queryEmbedding) return;
    let current = true;
    setBusy(true); setError("");
    const cancel = backend.queryEmbedding(request, result => {
      if (!current) return;
      setBusy(false);
      if ("error" in result) setError(result.error);
      else if (!("cancelled" in result)) { pageSelection.current = selectionKey; setPage(result); }
    });
    return () => { current = false; cancel(); };
  }, [active, backend.queryEmbedding, diagnostics?.available, request, retry, selectionKey]);

  const fitBounds = (bounds: EmbeddingPage["bounds"]) => {
    if (!bounds) return;
    const [minX, minY, maxX, maxY] = bounds;
    const spanX = Math.max(maxX - minX, 0.0001);
    const spanY = Math.max(maxY - minY, 0.0001);
    const fitZoom = Math.log2(Math.min(Math.max(1, size.width - 72) / spanX,
      Math.max(1, size.height - 72) / spanY));
    setCamera({ target: [(minX + maxX) / 2, (minY + maxY) / 2, 0], zoom: clamp(fitZoom, -20, 20) });
  };

  useEffect(() => {
    if (active && page && pageSelection.current === selectionKey && fitPending.current &&
        container.current?.clientWidth === size.width && container.current?.clientHeight === size.height) {
      fitBounds(page.bounds);
      fitPending.current = false;
    }
  }, [active, page, size, selectionKey]);

  const onViewStateChange = ({ viewState: next }: { viewState: Record<string, unknown> }) => {
    if (!activeRef.current) return;
    const target = next.target as number[] | undefined;
    const zoom = next.zoom as number | undefined;
    if (target && Number.isFinite(zoom)) setCamera({ target: [target[0], target[1], target[2] ?? 0], zoom: zoom! });
  };
  const onHover = (info: { object?: NonNullable<typeof page>["points"][number]; x: number; y: number }) => {
    if (!activeRef.current) return;
    setHover(info.object ? { text: info.object.label, x: info.x, y: info.y } : null);
  };
  const onClick = (info: { object?: NonNullable<typeof page>["points"][number] }) => {
    if (!activeRef.current) return;
    const point = info.object;
    if (point && point.count > 1) setCamera(current => ({
      target: [point.x, point.y, 0], zoom: clamp(current.zoom + 2, -20, 20),
    }));
  };

  return <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
    <div style={{ display: "flex", gap: 12, padding: "6px 12px", alignItems: "center", flexWrap: "wrap" }}>
      <span role="status">{diagnostics?.error ? "DOT embedding could not be parsed." : !diagnostics?.supplied ? "No DOT embedding attached." :
        !diagnostics.available ? "No usable coordinates matched tree tips." : busy ? "Updating embedding…" : page ?
          page.matchedCount ? "" : "No coordinates in the selected samples." : "Loading embedding…"}</span>
      <button type="button" className={buttonClass} onClick={() => fitBounds(pageRef.current?.bounds ?? null)} disabled={!page?.bounds}>Fit selection</button>
      <button type="button" className={buttonClass} aria-label="Zoom in" disabled={!page?.bounds} onClick={() => setCamera(current => ({ ...current, zoom: clamp(current.zoom + 1, -20, 20) }))}>+</button>
      <button type="button" className={buttonClass} aria-label="Zoom out" disabled={!page?.bounds} onClick={() => setCamera(current => ({ ...current, zoom: clamp(current.zoom - 1, -20, 20) }))}>−</button>

      <span>{field === "genotype" ? "Neutral points: genotype colouring is not supported in the embedding." : spec ? `Colour: ${fieldLabel}` : "Uncoloured points"}</span>
    </div>
    {diagnostics?.error && <div role="alert" style={{ padding: "4px 12px" }}>{diagnostics.error} <button type="button" className={buttonClass} onClick={() => setRetry(n => n + 1)}>Retry embedding</button></div>}
    {diagnostics?.supplied && !diagnostics.available && !diagnostics.error && <div role="alert" style={{ padding: "4px 12px" }}>
      No usable DOT coordinates matched tree tips.
    </div>}
    {error && <div role="alert" style={{ padding: "4px 12px" }}>{error} <button type="button" className={buttonClass} onClick={() => setRetry(n => n + 1)}>Retry embedding</button></div>}
    {active && diagnostics?.available && hasPoints && <div ref={container} aria-label="Sample embedding coordinates"
      style={{ position: "relative", flex: 1, minHeight: 0, touchAction: "none" }}>
      <EmbeddingCanvas page={page!} camera={camera} onViewStateChange={onViewStateChange} onHover={onHover} onClick={onClick} />
      {hover && <div role="tooltip" style={{ position: "absolute", left: 0, top: 0, zIndex: 2, pointerEvents: "none",
        padding: 8, borderRadius: 4, color: "white", background: "#111827", fontSize: 12,
        ...metadataTooltipStyle(hover.x, hover.y, size.width, size.height) as CSSProperties }}>{hover.text}</div>}
    </div>}
  </div>;
}

// A canvas owns its DeckGL resources. Remounting must never reuse a layer that
// the previous Deck instance finalized; data and camera live in the parent.
function EmbeddingCanvas({ page, camera, onViewStateChange, onHover, onClick }: {
  page: EmbeddingPage;
  camera: Camera;
  onViewStateChange: (info: { viewState: Record<string, unknown> }) => void;
  onHover: (info: { object?: EmbeddingPage["points"][number]; x: number; y: number }) => void;
  onClick: (info: { object?: EmbeddingPage["points"][number] }) => void;
}) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const layers = useMemo(() => [new ScatterplotLayer({
    id: "embedding-points",
    data: page?.points ?? [],
    pickable: true,
    stroked: true,
    filled: true,
    radiusUnits: "pixels",
    lineWidthUnits: "pixels",
    getPosition: (point: EmbeddingPage["points"][number]) => [point.x, point.y, 0],
    getRadius: (point: EmbeddingPage["points"][number]) => Math.min(18, 4 + Math.sqrt(point.count) * 1.5),
    getFillColor: (point: EmbeddingPage["points"][number]) => point.color,
    getLineColor: [255, 255, 255, 220],
    getLineWidth: 1,
    updateTriggers: { getFillColor: [page?.points] },
  })], [page]);

  const view = useMemo(() => new OrthographicView({ id: "embedding", controller: true, flipY: false }), []);
  return <DeckGL views={view} viewState={camera} layers={layers}
    controller={{ scrollZoom: true, dragPan: true, doubleClickZoom: true }}
    onViewStateChange={info => { if (alive.current) onViewStateChange(info); }}
    onHover={info => { if (alive.current) onHover(info); }}
    onClick={info => { if (alive.current) onClick(info); }}
    style={{ position: "absolute", inset: "0" }} />;
}
