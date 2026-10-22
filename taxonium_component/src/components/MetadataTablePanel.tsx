import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import { METADATA_TABLE_PAGE_SIZE, METADATA_TABLE_MAX_FIELDS } from "../types/metadataTable";
import { metadataTableText, tableWindow } from "../utils/metadataTable";
import prettifyName from "../utils/prettifyName";
import { useMetadataTable } from "../hooks/useMetadataTable";

const ROW_HEIGHT = 30;
const COLUMN_WIDTH = 180;
const ID_WIDTH = 220;

interface Props {
  backend: LocalBackend;
  config: Config;
  selectedNodeId: number | string | null;
  metadataMatrix: MetadataMatrix;
  active: boolean;
}

function ColumnChooser({ fields, hidden, setHidden, config }: {
  fields: string[]; hidden: Set<string>; setHidden: (hidden: Set<string>) => void; config: Config;
}) {
  const [search, setSearch] = useState("");
  const [top, setTop] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => fields.filter(field =>
    prettifyName(field, config).toLowerCase().includes(search.toLowerCase())), [fields, config, search]);
  const window = tableWindow(top, 180, ROW_HEIGHT, filtered.length);
  return <details className="relative">
    <summary className="cursor-pointer">Columns ({fields.length - hidden.size}/{fields.length})</summary>
    <div className="absolute right-0 bottom-full bg-white border shadow-lg p-2 z-30" style={{ width: 280 }}>
      <input aria-label="Find table columns" placeholder="Find columns" value={search} className="w-full border p-1"
        onChange={event => { setSearch(event.target.value); setTop(0); if (scroll.current) scroll.current.scrollTop = 0; }} />
      <div className="flex gap-3 my-1">
        <button type="button" onClick={() => setHidden(new Set())}>Show all</button>
        <button type="button" onClick={() => setHidden(new Set(fields))}>Hide all</button>
      </div>
      <div ref={scroll} style={{ height: 180, overflow: "auto" }} onScroll={event => setTop(event.currentTarget.scrollTop)}>
        <div style={{ height: filtered.length * ROW_HEIGHT, position: "relative" }}>
          {filtered.slice(window.start, window.end).map((field, i) => <label key={field}
            className="flex items-center gap-2 truncate" style={{ position: "absolute", top: (window.start + i) * ROW_HEIGHT, height: ROW_HEIGHT, width: "100%" }}>
            <input type="checkbox" aria-label={`Table column ${prettifyName(field, config)}`} checked={!hidden.has(field)} onChange={() => {
              const next = new Set(hidden); if (next.has(field)) next.delete(field); else next.add(field); setHidden(next);
            }} />{prettifyName(field, config)}
          </label>)}
        </div>
      </div>
      {!filtered.length && <p>No matching columns</p>}
    </div>
  </details>;
}

export default function MetadataTablePanel({ backend, config, selectedNodeId, metadataMatrix, active }: Props) {
  const allFields = useMemo(() => Object.keys(config.metadataSummaries ?? {}).sort((a, b) =>
    prettifyName(a, config).localeCompare(prettifyName(b, config))), [config.metadataSummaries, config]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const fields = useMemo(() => allFields.filter(field => !hidden.has(field)), [allFields, hidden]);
  const [paging, setPaging] = useState({ selection: selectedNodeId, page: 0 });
  const page = paging.selection === selectedNodeId ? paging.page : 0;
  const setPage = (value: number) => setPaging({ selection: selectedNodeId, page: value });
  const [pageInput, setPageInput] = useState("1");
  const scroll = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 180, top: 0, left: 0 });
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth > 0 && element.clientHeight > 0)
        setViewport(old => ({ ...old, width: element.clientWidth, height: element.clientHeight }));
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (active && scroll.current) {
      scroll.current.scrollTop = viewport.top;
      scroll.current.scrollLeft = viewport.left;
    }
  }, [active]);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    setViewport(old => ({ ...old, top: 0 })); setPageInput(String(page + 1));
    // Persist the reset so selecting the previous clade later never restores its old page.
    setPaging({ selection: selectedNodeId, page });
  }, [selectedNodeId, page]);
  const columns = tableWindow(viewport.left, Math.max(0, viewport.width - ID_WIDTH), COLUMN_WIDTH, fields.length, 2, METADATA_TABLE_MAX_FIELDS);
  const requestedFields = fields.slice(columns.start, columns.end);
  const { response, retry } = useMetadataTable(active ? backend.queryMetadataTable : undefined, {
    selectedNodeId, pageIndex: page, fields: requestedFields, nameField: String(config.name_accessor ?? "name"),
  });
  const data = response && !("error" in response) ? response : null;
  // Keep only dimensions while another column window loads, so scrolling cannot
  // collapse the page height. No previous rows or metadata projections are cached.
  const [extent, setExtent] = useState({ selection: selectedNodeId, page, rows: 0 });
  if (data && (extent.selection !== selectedNodeId || extent.page !== page || extent.rows !== data.rows.length))
    setExtent({ selection: selectedNodeId, page, rows: data.rows.length });
  const rowCount = data?.rows.length ?? (extent.selection === selectedNodeId && extent.page === page ? extent.rows : 0);
  const [focusedValue, setFocusedValue] = useState<{ text: string; left: number; top: number } | null>(null);
  useEffect(() => setFocusedValue(null), [response, active]);
  const pages = data ? Math.max(1, Math.ceil(data.total / METADATA_TABLE_PAGE_SIZE)) : 1;
  useEffect(() => { if (data && data.pageIndex !== page) setPage(data.pageIndex); }, [data, page]);
  const rows = tableWindow(Math.max(0, viewport.top - ROW_HEIGHT), viewport.height, ROW_HEIGHT, data?.rows.length ?? 0, 4);
  const totalWidth = ID_WIDTH + fields.length * COLUMN_WIDTH;
  const cellStyle = { height: ROW_HEIGHT, width: COLUMN_WIDTH, padding: "4px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const };
  const valueColor = (field: string, value: unknown) => {
    const spec = metadataMatrix.metadata?.specs[field];
    return metadataMatrix.getValueColor({
      field, label: prettifyName(field, config), kind: spec?.kind ?? "categorical",
      color: metadataMatrix.getFieldColor(field), colorSpec: spec,
    }, value);
  };
  return <>
    <div className="flex flex-wrap items-center gap-3 border-b px-3 py-1 text-xs shrink-0">
      <span>{selectedNodeId === null ? "All samples" : `Selected node ${selectedNodeId}`}</span>
      <span role="status" aria-live="polite">{data ? `${data.total.toLocaleString()} samples · ${data.total ? data.pageIndex * METADATA_TABLE_PAGE_SIZE + 1 : 0}–${Math.min(data.total, (data.pageIndex + 1) * METADATA_TABLE_PAGE_SIZE)} shown` : response ? "Unable to load samples" : "Loading samples…"}</span>
      <button type="button" aria-label="First table page" disabled={!data || page === 0} onClick={() => setPage(0)}>First</button>
      <button type="button" aria-label="Previous table page" disabled={!data || page === 0} onClick={() => setPage(page - 1)}>Previous</button>
      <form onSubmit={event => { event.preventDefault(); const n = Number(pageInput); if (data && Number.isInteger(n)) setPage(Math.max(0, Math.min(pages - 1, n - 1))); }}>
        <label>Page <input aria-label="Table page" type="number" min={1} max={pages} value={pageInput} disabled={!data}
          onChange={event => setPageInput(event.target.value)} className="border rounded px-1" style={{ width: 72 }} /></label>
        <span> of {data ? pages.toLocaleString() : "…"}</span>
        <button type="submit" disabled={!data} className="ml-2">Go</button>
      </form>
      <button type="button" aria-label="Next table page" disabled={!data || page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
      <button type="button" aria-label="Last table page" disabled={!data || page >= pages - 1} onClick={() => setPage(pages - 1)}>Last</button>
      <span className="grow" />
      <ColumnChooser fields={allFields} hidden={hidden} setHidden={setHidden} config={config} />
    </div>
    {response && "error" in response && <div role="alert" className="px-3 py-2 text-sm">{response.error} <button type="button" className="underline" onClick={retry}>Retry</button></div>}
    {data?.total === 0 && <div className="p-3 text-sm">No samples in this selection.</div>}
    <div ref={scroll} aria-label="Metadata table scroll area" tabIndex={0} className="grow min-h-0 overflow-auto"
      onFocus={event => {
        const cell = (event.target as HTMLElement).closest<HTMLElement>('[role="cell"]');
        if (!cell?.title) return;
        const bounds = cell.getBoundingClientRect();
        setFocusedValue({ text: cell.title, left: Math.max(0, Math.min(bounds.left, window.innerWidth - 320)), top: bounds.top });
      }}
      onBlur={() => setFocusedValue(null)}
      onScroll={event => {
        if (!active || !event.currentTarget.clientWidth || !event.currentTarget.clientHeight) return;
        const { scrollTop: top, scrollLeft: left } = event.currentTarget;
        setViewport(old => ({ ...old, top, left })); setFocusedValue(null);
      }}>
      <div role="table" aria-label="Sample metadata" aria-rowcount={(data?.total ?? 0) + 1} aria-colcount={fields.length + 1}
        aria-busy={!response} style={{ width: Math.max(totalWidth, viewport.width), position: "relative" }}>
        <div role="row" aria-rowindex={1} className="bg-gray-100 border-b font-semibold text-xs" style={{ position: "sticky", top: 0, height: ROW_HEIGHT, zIndex: 2 }}>
          <div role="columnheader" aria-colindex={1} style={{ ...cellStyle, position: "sticky", left: 0, width: ID_WIDTH, zIndex: 3, background: "#f3f4f6" }}>Sample identifier</div>
          {requestedFields.map((field, i) => <div role="columnheader" aria-colindex={columns.start + i + 2} key={field}
            title={prettifyName(field, config)} style={{ ...cellStyle, position: "absolute", left: ID_WIDTH + (columns.start + i) * COLUMN_WIDTH, top: 0 }}>{prettifyName(field, config)}</div>)}
        </div>
        <div role="rowgroup" style={{ position: "relative", height: rowCount * ROW_HEIGHT }}>
          {data?.rows.slice(rows.start, rows.end).map((row, i) => <div role="row" aria-rowindex={data.pageIndex * METADATA_TABLE_PAGE_SIZE + rows.start + i + 2}
            key={row.nodeId} data-node-id={row.nodeId} className="border-b text-xs" style={{ position: "absolute", top: (rows.start + i) * ROW_HEIGHT, height: ROW_HEIGHT, width: "100%" }}>
            <div role="cell" aria-colindex={1} tabIndex={0} title={metadataTableText(row.name)} style={{ ...cellStyle, position: "sticky", left: 0, width: ID_WIDTH, zIndex: 1, background: "white" }}>{metadataTableText(row.name)}</div>
            {data.fields.map((field, column) => {
              const value = row.values[column], text = metadataTableText(value), color = valueColor(field, value);
              return <div role="cell" aria-colindex={columns.start + column + 2} tabIndex={0} title={text} key={field}
                style={{ ...cellStyle, position: "absolute", left: ID_WIDTH + (columns.start + column) * COLUMN_WIDTH, top: 0 }}>
                <span aria-hidden="true" style={{ display: "inline-block", width: 9, height: 9, marginRight: 6, background: color ? `rgb(${color.join(",")})` : "transparent", border: "1px solid #ddd" }} />{text}
              </div>;
            })}
          </div>)}
        </div>
      </div>
    </div>
    {focusedValue && <div role="tooltip" className="bg-gray-900 text-white text-xs p-2 rounded shadow-lg"
      style={{ position: "fixed", zIndex: 50, left: focusedValue.left, top: focusedValue.top, transform: "translateY(-100%)", maxWidth: 320, maxHeight: 160, overflow: "auto", overflowWrap: "anywhere" }}>
      {focusedValue.text}
    </div>}
  </>;
}
