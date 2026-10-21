import { useEffect, useMemo, useState } from "react";
import type { LocalBackend } from "../types/backend";
import type { MetadataTableRequest, MetadataTableResponse } from "../types/metadataTable";

export function useMetadataTable(query: LocalBackend["queryMetadataTable"], request: MetadataTableRequest) {
  const key = JSON.stringify(request);
  const stableRequest = useMemo(() => JSON.parse(key) as MetadataTableRequest, [key]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    query: typeof query; key: string; retry: number; response: MetadataTableResponse;
  } | null>(null);
  useEffect(() => {
    if (!query) return;
    let active = true;
    const cancel = query(stableRequest, response => {
      if (active) setResult({ query, key, retry, response });
    });
    return () => { active = false; cancel(); };
  }, [query, key, stableRequest, retry]);
  const response = result?.query === query && result?.key === key && result?.retry === retry ? result.response : null;
  return { response, retry: () => setRetry(value => value + 1) };
}
