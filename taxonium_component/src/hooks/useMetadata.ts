import { useCallback, useMemo } from "react";
import type { Config } from "../types/backend";
import type { Query } from "../types/query";
import { createMetadataColor, resolveMetadataSpec, sanitizeMetadataOverrides,
  type MetadataOverride, type MetadataTypeChoice, type RGB } from "../utils/metadata";

export default function useMetadata(config: Config, query: Query,
  updateQuery: (query: Partial<Query>) => void, enabled: boolean) {
  const overrides = useMemo(() => sanitizeMetadataOverrides(query.metadata), [query.metadata]);
  const specs = useMemo(() => Object.fromEntries(enabled ? Object.entries(config.metadataSummaries ?? {}).map(([field, summary]) =>
    [field, resolveMetadataSpec(field, summary, config.metadataFields?.[field], overrides[field],
      config.colorRamps?.[field], config.colorMapping as Record<string, RGB> | undefined)]
  ) : []), [config.metadataSummaries, config.metadataFields, config.colorRamps, config.colorMapping, overrides, enabled]);
  const colors = useMemo(() => Object.fromEntries(Object.entries(specs).map(([field, spec]) =>
    [field, createMetadataColor(spec)])), [specs]);
  const updateField = useCallback((field: string, change: Partial<MetadataOverride>) => {
    updateQuery({ metadata: JSON.stringify({ ...overrides, [field]: { ...overrides[field], ...change } }) });
  }, [overrides, updateQuery]);
  const setType = useCallback((field: string, type: MetadataTypeChoice) =>
    updateField(field, { type: type === "auto" ? undefined : type }), [updateField]);
  const reshuffle = useCallback((field: string) => {
    // A seed is compact URL state; no category list is stored.
    const random = new Uint32Array(1); crypto.getRandomValues(random);
    updateField(field, { seed: random[0] === overrides[field]?.seed ? random[0] + 1 : random[0], colors: {} });
  }, [updateField, overrides]);
  const setColor = useCallback((field: string, value: string, color: RGB) =>
    updateField(field, { colors: { ...overrides[field]?.colors, [value]: color } }), [updateField, overrides]);
  return useMemo(() => ({ specs, colors, overrides, setType, reshuffle, setColor }),
    [specs, colors, overrides, setType, reshuffle, setColor]);
}
export type MetadataController = ReturnType<typeof useMetadata>;
