import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { LocalBackend } from "../types/backend";
import type { MetadataTableRequest, MetadataTableResponse } from "../types/metadataTable";
import { useMetadataTable } from "./useMetadataTable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("metadata table requests", () => {
  it("ignores stale scopes, columns and datasets, cancels on collapse and supports retry", async () => {
    const callbacks: ((result: MetadataTableResponse) => void)[] = [];
    const cancel = vi.fn();
    const query = vi.fn((_request, callback) => { callbacks.push(callback); return cancel; });
    let state: ReturnType<typeof useMetadataTable>;
    const root = createRoot(document.createElement("div"));
    const request: MetadataTableRequest = { selectedNodeId: null, pageIndex: 0, fields: ["meta_a"], nameField: "name" };
    function Harness({ req = request, q = query }: { req?: MetadataTableRequest; q?: LocalBackend["queryMetadataTable"] | null }) {
      state = useMetadataTable(q ?? undefined, req);
      return null;
    }
    const result = { total: 1, pageIndex: 0, rows: [], fields: [] };
    try {
      await act(async () => root.render(<Harness />));
      await act(async () => root.render(<Harness req={{ ...request, selectedNodeId: 1 }} />));
      await act(async () => callbacks[0](result));
      expect(state!.response).toBeNull();
      await act(async () => callbacks[1](result));
      expect(state!.response).toEqual(result);
      await act(async () => root.render(<Harness req={{ ...request, fields: ["meta_b"] }} />));
      expect(state!.response).toBeNull();
      await act(async () => callbacks[2]({ error: "try again" }));
      expect(state!.response).toEqual({ error: "try again" });
      await act(async () => state!.retry());
      expect(state!.response).toBeNull();
      await act(async () => callbacks[3](result));
      expect(state!.response).toEqual(result);
      await act(async () => root.render(<Harness q={null} />));
      expect(query).toHaveBeenCalledTimes(4);
      expect(cancel).toHaveBeenCalledTimes(4);
      await act(async () => callbacks[3]({ ...result, total: 900 }));
      expect(state!.response).toBeNull();
      const replacement = vi.fn(() => cancel);
      await act(async () => root.render(<Harness q={replacement} />));
      expect(state!.response).toBeNull();
      expect(replacement).toHaveBeenCalledTimes(1);
    } finally { await act(async () => root.unmount()); }
  });
});
