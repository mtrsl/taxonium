import { useEffect, useMemo, useRef, useState } from "react";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { TimelineSettings } from "../hooks/useTimeline";
import type { TimelinePage, TimelineRequest } from "../types/timeline";
import { timeLabel } from "../utils/timeline";
import prettifyName from "../utils/prettifyName";
import { NEUTRAL_METADATA_COLOR } from "../utils/metadata";

interface Props {
  backend: LocalBackend; config: Config; selectedNodeId: string | number | null;
  field: string; metadataMatrix: MetadataMatrix; active: boolean; timeline?: TimelineSettings;
}
const button = "tx-button rounded-sm border border-gray-400 bg-gray-100 px-2 py-1 text-sm disabled:opacity-50";
export default function TimelinePanel({ backend, config, selectedNodeId, field, metadataMatrix, active, timeline }: Props) {
  const chart = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 150 });
  const source = timeline?.sources.find(s => s.id === timeline.source);
  useEffect(() => {
    if (!active || !source || !chart.current) return;
    const element = chart.current;
    const measure = () => { if (element.clientWidth > 0 && element.clientHeight > 0) setSize({ width: element.clientWidth, height: element.clientHeight }); };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [active, source]);
  const [range, setRange] = useState<[number, number]>();
  const [page, setPage] = useState<TimelinePage>();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const spec = metadataMatrix.metadata?.specs[field];
  const rgb = field === "genotype" ? NEUTRAL_METADATA_COLOR : metadataMatrix.getFieldColor(field);
  const fieldLabel = prettifyName(field, config);
  useEffect(() => { setRange(undefined); setPage(undefined); }, [source?.id, backend.queryTimeline]);
  const request = useMemo<TimelineRequest>(() => ({ selectedNodeId, source: source?.id, range, colorSpec: spec, color: rgb, fieldLabel }),
    [selectedNodeId, source?.id, range, spec, rgb[0], rgb[1], rgb[2], fieldLabel]);
  useEffect(() => {
    if (!active || !source || !backend.queryTimeline) return;
    let current = true;
    setBusy(true); setError("");
    const timer = setTimeout(() => {
      cancel = backend.queryTimeline!(request, result => {
        if (!current) return;
        setBusy(false);
        if ("error" in result) setError(result.error);
        else if (!("cancelled" in result)) setPage(result);
      });
    }, 80);
    let cancel: (() => void) | undefined;
    return () => { current = false; clearTimeout(timer); cancel?.(); };
  }, [active, source, backend.queryTimeline, request, retry]);
  const extent = range ?? (source ? [source.min, source.max] : [0, 0]);
  const max = Math.max(1, ...page?.bars.map(b => b.count) ?? []);
  const overviewMax = Math.max(1, ...page?.overview.map(b => b.count) ?? []);
  const plotWidth = Math.max(1, size.width - 70), plotHeight = Math.max(20, size.height - 46), bottomY = plotHeight + 14;
  const visiblePage = page?.source?.id === source?.id ? page : undefined;
  return <div className="flex min-h-0 h-full flex-col" aria-label="Timeline chart">
    <div className="px-3 py-1 text-xs" role="status">
      {timeline?.error || error ? <>{timeline?.error || error} <button className={button} onClick={() => { timeline?.retry(); setRetry(n => n + 1); }}>Retry timeline</button></> :
        !source ? "No usable dates detected. Use Year / Month / Day columns or ISO dates (yyyy-mm or yyyy-mm-dd)." :
          <>{source.label} · {source.precision} · {busy ? "Updating timeline…" : visiblePage ? `${visiblePage.datedCount.toLocaleString()} dated samples; ${visiblePage.ignoredCount.toLocaleString()} missing or invalid dates ignored` : "Loading timeline…"}</>}
      {field === "genotype" && <span> · Neutral bars: genotype colouring is not supported.</span>}
    </div>
    {source && <>
      <div className="px-3 text-xs text-gray-600">Drag the handles to zoom. Linked filtering is disabled to keep large datasets responsive.</div>
      <div className="grow min-h-0 mx-3" ref={chart}>
        <svg viewBox={`0 0 ${size.width} ${size.height}`} style={{ width: "100%", height: "100%", minHeight: 60 }} role="img" aria-label={`Timeline stacked sample counts by ${source.precision}`}>
          {[0, 0.5, 1].map(v => <g key={v}><line x1="55" x2={size.width - 15} y1={bottomY - v * plotHeight} y2={bottomY - v * plotHeight} stroke="#e5e7eb" /><text x="50" y={bottomY + 4 - v * plotHeight} textAnchor="end" fontSize="11">{Math.round(max * v).toLocaleString()}</text></g>)}
          <text x="12" y={bottomY - 10} transform={`rotate(-90 12 ${bottomY - 10})`} fontSize="12">Count</text>
          {visiblePage?.bars.map((bar, i, all) => {
            let bottom = bottomY;
            return <g key={bar.start} data-time={bar.label} data-count={bar.count}>
              {bar.segments.map((segment, segmentIndex) => {
                const height = segment.count / max * plotHeight; bottom -= height;
                return <rect key={segmentIndex} x={55 + i / all.length * plotWidth} y={bottom} width={Math.max(0.5, plotWidth / all.length - 1)} height={height}
                  fill={`rgb(${segment.color.join(",")})`}><title>{`${bar.label}\n${spec ? fieldLabel + ": " : ""}${segment.label}\n${segment.count.toLocaleString()} samples\nTotal: ${bar.count.toLocaleString()}`}</title></rect>;
              })}
              {(i === 0 || i === all.length - 1 || (all.length > 4 && i % Math.ceil(all.length / Math.max(2, Math.floor(size.width / 110))) === 0)) && <text x={55 + (i + 0.5) / all.length * plotWidth} y={bottomY + 16} textAnchor={i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"} fontSize="11">{timeLabel(bar.start, source.precision)}</text>}
            </g>;
          })}
          <text x={55 + plotWidth / 2} y={size.height - 1} textAnchor="middle" fontSize="12">Time</text>
        </svg>
      </div>
      <div className="shrink-0 px-3 pb-2 text-xs">
        <div className="flex items-center justify-between"><span>{timeLabel(extent[0], source.precision)} – {timeLabel(extent[1], source.precision)}</span><button className={button} onClick={() => setRange(undefined)}>Reset range</button></div>
        <div style={{ position: "relative", height: 42, margin: "2px 8px" }}>
          <svg viewBox="0 0 1000 32" preserveAspectRatio="none" style={{ width: "100%", height: 32 }} role="img" aria-label="Full timeline overview">
            {visiblePage?.overview.map((bar, i, all) => <rect key={bar.start} x={i / all.length * 1000} y={32 - bar.count / overviewMax * 30} width={1000 / all.length} height={bar.count / overviewMax * 30} fill="#94a3b8" />)}
          </svg>
          <div style={{ position: "absolute", top: 0, height: 32, background: "#2563eb22", pointerEvents: "none", left: `${(extent[0] - source.min) / (source.max - source.min || 1) * 100}%`, right: `${(source.max - extent[1]) / (source.max - source.min || 1) * 100}%` }} />
          <input className="timeline-range" type="range" aria-label="Timeline range start" min={source.min} max={source.max} step={1} value={extent[0]} disabled={source.min === source.max}
            style={{ zIndex: extent[0] === source.max ? 3 : 1 }} onChange={e => setRange([Math.min(+e.target.value, extent[1]), extent[1]])} />
          <input className="timeline-range" type="range" aria-label="Timeline range end" min={source.min} max={source.max} step={1} value={extent[1]} disabled={source.min === source.max}
            onChange={e => setRange([extent[0], Math.max(+e.target.value, extent[0])])} />
        </div>
      </div>
    </>}
  </div>;
}
