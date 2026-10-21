import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Description } from "@headlessui/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyItem } from "./Key";
import { tableWindow } from "../utils/metadataTable";

export const legendEntryKey = (item: KeyItem) => JSON.stringify([!!item.missing, item.value]);

interface EntryProps {
  item: KeyItem;
  hoveredKey: string | null;
  setHoveredKey: (key: string | null) => void;
  onActivate: (value: string) => void;
  onInspect?: (label: string | null) => void;
  descriptionId?: string;
  singleLine?: boolean;
}

export function LegendEntry({ item, hoveredKey, setHoveredKey, onActivate, onInspect, descriptionId, singleLine }: EntryProps) {
  const inspect = () => { setHoveredKey(item.missing ? null : item.value); onInspect?.(item.missing ? "Missing metadata" : item.value); };
  const clear = () => { setHoveredKey(null); onInspect?.(null); };
  return <button type="button" aria-disabled={item.missing || undefined} aria-describedby={descriptionId}
    aria-label={item.missing ? "Missing metadata" : `Edit colour for ${item.value}`}
    title={item.missing ? "Missing metadata" : `${item.value} — Edit colour`}
    className={`key-text block text-xs text-gray-700 text-left w-full ${singleLine ? "h-full px-2 truncate" : "mt-0.5 break-all"}`}
    style={{ cursor: item.missing ? "default" : "pointer" }}
    onClick={() => { if (!item.missing) onActivate(item.value); }}
    onFocus={inspect} onBlur={clear} onMouseEnter={inspect}
    onMouseLeave={event => { if (document.activeElement !== event.currentTarget) clear(); }}>
    <span aria-hidden="true" style={{ backgroundColor: `rgb(${item.color.join(",")})` }}
      className={`circle w-2 h-2 mr-2 rounded-full inline-block transform transition-transform ${!item.missing && hoveredKey === item.value ? "scale-150" : "scale-100"}`} />
    {item.value}
  </button>;
}

interface Props {
  title: string;
  entries: KeyItem[];
  onClose: () => void;
  onActivate: (value: string) => void;
  hoveredKey: string | null;
  setHoveredKey: (key: string | null) => void;
}

const ROW_HEIGHT = 36;

export default function LegendDialog({ title, entries, onClose, onActivate, hoveredKey, setHoveredKey }: Props) {
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 360 });
  const [scroll, setScroll] = useState<HTMLDivElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const filtered = useMemo(() => entries.filter(item => item.value.toLowerCase().includes(search.toLowerCase())), [entries, search]);
  // Palette/count updates alone do not reset scrolling; membership or order does.
  const membership = useMemo(() => JSON.stringify(entries.map(legendEntryKey)), [entries]);
  useLayoutEffect(() => {
    if (scroll) scroll.scrollTop = 0;
    setViewport(old => ({ ...old, top: 0 }));
    setDetail(null); setHoveredKey(null);
  }, [membership, search, setHoveredKey, scroll]);
  useEffect(() => () => setHoveredKey(null), [setHoveredKey]);
  useLayoutEffect(() => {
    const element = scroll;
    if (!element) return;
    const measure = () => setViewport(old => ({ ...old, height: element.clientHeight }));
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [scroll]);
  const window = tableWindow(viewport.top, viewport.height, ROW_HEIGHT, filtered.length, 4);
  // Scoped utility selectors apply to descendants of .taxonium, not this portal
  // root itself. Give the root explicit positioning so its stacking order works.
  return <Dialog open onClose={onClose} initialFocus={searchInput} className="taxonium"
    style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
    <DialogBackdrop className="fixed inset-0 bg-black/30" />
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <DialogPanel className="bg-white rounded-lg shadow-xl p-4 flex flex-col min-h-0 w-full"
        style={{ maxWidth: 560, maxHeight: "80dvh", height: 560 }}>
        <div className="flex items-start gap-3 shrink-0">
          <DialogTitle className="font-semibold grow break-all">{title} — All categories</DialogTitle>
          <button type="button" className="border rounded px-2 py-1 text-sm" onClick={onClose}>Close</button>
        </div>
        <Description className="text-xs text-gray-600 my-2 shrink-0">Categories reflect currently loaded tree data.</Description>
        <input ref={searchInput} aria-label="Search legend categories" type="search" placeholder="Search categories"
          className="border rounded px-2 py-1 w-full shrink-0" value={search} onChange={event => setSearch(event.target.value)} />
        <p role="status" className="text-xs text-gray-600 my-2 shrink-0">{filtered.length.toLocaleString()} of {entries.length.toLocaleString()} categories</p>
        <div ref={setScroll} tabIndex={0} aria-label="Legend categories" className="overflow-auto min-h-0 grow border rounded"
          onScroll={event => {
            const top = event.currentTarget.scrollTop;
            setViewport(old => ({ ...old, top })); setDetail(null); setHoveredKey(null);
          }}>
          {!filtered.length && <p className="p-3 text-sm">No matching categories</p>}
          <div role="list" aria-label="Categories" style={{ height: filtered.length * ROW_HEIGHT, position: "relative" }}>
            {filtered.slice(window.start, window.end).map((item, index) => <div key={legendEntryKey(item)} role="listitem"
              aria-setsize={filtered.length} aria-posinset={window.start + index + 1}
              className="border-b border-gray-100" style={{ position: "absolute", top: (window.start + index) * ROW_HEIGHT, height: ROW_HEIGHT, width: "100%" }}>
              <LegendEntry item={item} hoveredKey={hoveredKey} setHoveredKey={setHoveredKey} onActivate={onActivate}
                singleLine onInspect={setDetail} descriptionId={descriptionId} />
            </div>)}
          </div>
        </div>
        <div id={descriptionId} role={detail === null ? undefined : "tooltip"} className="text-xs text-gray-600 mt-2 overflow-auto shrink-0"
          style={{ height: 48, overflowWrap: "anywhere" }}>
          {detail ?? "Select a category to edit its colour."}
        </div>
      </DialogPanel>
    </div>
  </Dialog>;
}
