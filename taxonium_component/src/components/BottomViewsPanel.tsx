import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import MetadataTablePanel from "./MetadataTablePanel";
import GeographicMapPanel from "./GeographicMapPanel";
import EmbeddingView from "./EmbeddingView";

export type BottomView = "metadata" | "map" | "embedding";
export function resolveBottomView(value: unknown, hasEmbedding: boolean): BottomView {
  return value === "map" || (value === "embedding" && hasEmbedding) ? value : "metadata";
}
interface Props {
  backend: LocalBackend;
  config: Config;
  selectedNodeId: string | number | null;
  field: string;
  metadataMatrix: MetadataMatrix;
  bottomView?: unknown;
  onBottomViewChange: (view: BottomView) => void;
}

export default function BottomViewsPanel(props: Props) {
  const [open, setOpen] = useState(true);
  const [height, setHeight] = useState(300);
  const [maxHeight, setMaxHeight] = useState(500);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const [dataset, setDataset] = useState({ table: props.backend.queryMetadataTable,
    geography: props.backend.queryGeography, embedding: props.backend.queryEmbedding, version: 0 });
  if (dataset.table !== props.backend.queryMetadataTable || dataset.geography !== props.backend.queryGeography ||
      dataset.embedding !== props.backend.queryEmbedding)
    setDataset({ table: props.backend.queryMetadataTable, geography: props.backend.queryGeography,
      embedding: props.backend.queryEmbedding, version: dataset.version + 1 });
  const activeTab = resolveBottomView(props.bottomView, !!props.config.embeddingDiagnostics?.supplied);
  const id = useId();
  const tabs: { value: BottomView; label: string; disabled?: boolean }[] = [
    { value: "metadata", label: "Metadata table" }, { value: "map", label: "Map" },
    { value: "embedding", label: "Embedding", disabled: !props.config.embeddingDiagnostics?.supplied },
  ];
  useLayoutEffect(() => {
    const parent = panel.current?.parentElement;
    if (!parent) return;
    const measure = () => { if (parent.clientHeight > 0) setMaxHeight(parent.clientHeight / 2); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const actualHeight = Math.min(height, maxHeight);
  const minHeight = Math.min(160, maxHeight);
  const resize = (value: number) => setHeight(Math.min(maxHeight, Math.max(minHeight, value)));
  return <section ref={panel} aria-label="Data views" className="shrink-0 border-t bg-white flex flex-col min-h-0" style={{ height: open ? actualHeight : 32 }}>
    {open && <div role="separator" aria-label="Resize data views" aria-orientation="horizontal" tabIndex={0}
      aria-valuemin={minHeight} aria-valuemax={Math.round(maxHeight)} aria-valuenow={Math.round(actualHeight)}
      style={{ height: 6, cursor: "row-resize", background: "#d1d5db", flexShrink: 0, touchAction: "none" }}
      onKeyDown={event => {
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          event.preventDefault(); resize(event.key === "Home" ? minHeight : event.key === "End" ? maxHeight : actualHeight + (event.key === "ArrowUp" ? 20 : -20));
        }
      }}
      onPointerDown={event => { drag.current = { y: event.clientY, height: actualHeight }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (drag.current) resize(drag.current.height + drag.current.y - event.clientY); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />}
    <button type="button" aria-expanded={open} className="text-left px-3 text-sm font-semibold shrink-0" style={{ height: 30 }} onClick={() => setOpen(value => !value)}>
      {open ? "▾" : "▸"} Data views
    </button>
    {open && <div role="tablist" aria-label="Data view" className="flex shrink-0 flex-wrap border-b px-2" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const enabled = tabs.filter(tab => !tab.disabled);
      const index = enabled.findIndex(tab => tab.value === activeTab);
      const next = enabled[event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 :
        (index + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length].value;
      props.onBottomViewChange(next);
      document.getElementById(`${id}-${next}-tab`)?.focus();
    }}>
      {tabs.map(tab => <button key={tab.value} type="button" role="tab" id={`${id}-${tab.value}-tab`}
        aria-controls={`${id}-${tab.value}-panel`} aria-selected={activeTab === tab.value}
        disabled={tab.disabled} aria-disabled={tab.disabled} tabIndex={activeTab === tab.value ? 0 : -1}
        className="tx-button px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ borderBottom: `2px solid ${activeTab === tab.value ? "#2563eb" : "transparent"}` }}
        onClick={() => props.onBottomViewChange(tab.value)}>{tab.label}</button>)}
    </div>}
    <div key={dataset.version} className="grow min-h-0 flex-col" style={{ display: open ? "flex" : "none" }}>
      {tabs.map(tab => <div key={tab.value} role="tabpanel" id={`${id}-${tab.value}-panel`}
        aria-labelledby={`${id}-${tab.value}-tab`} hidden={!open || activeTab !== tab.value}
        style={{ display: open && activeTab === tab.value ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {tab.value === "metadata" ? <MetadataTablePanel {...props} active={open && activeTab === tab.value} /> :
          tab.value === "map" ? <GeographicMapPanel {...props} active={open && activeTab === tab.value} /> :
            <EmbeddingView {...props} active={open && activeTab === tab.value} />}
      </div>)}
    </div>
  </section>;
}
