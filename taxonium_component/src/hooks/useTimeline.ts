import { useEffect, useState } from "react";
import type { Backend } from "../types/backend";
import type { TimelineSource } from "../types/timeline";

/** Dataset-local source settings shared by Options and the bottom panel. */
export default function useTimeline(backend: Backend) {
  const query = backend.type === "local" ? backend.queryTimeline : undefined;
  const [sources, setSources] = useState<TimelineSource[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setSources([]); setSource(""); setError("");
    if (!query) return;
    let current = true;
    const cancel = query({ selectedNodeId: null }, result => {
      if (!current) return;
      if ("error" in result) setError(result.error);
      else if (!("cancelled" in result)) { setSources(result.sources); setSource(result.source?.id ?? ""); }
    });
    return () => { current = false; cancel(); };
  }, [query, retry]);
  return { sources, source, setSource, error, retry: () => setRetry(n => n + 1) };
}
export type TimelineSettings = ReturnType<typeof useTimeline>;
