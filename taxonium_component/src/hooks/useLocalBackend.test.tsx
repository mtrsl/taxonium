import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { LocalBackend, NodeDetails, MetadataDensityRequest } from "../types/backend";
import { useMetadataTable } from "./useMetadataTable";

const worker = vi.hoisted(() => ({ postMessage: vi.fn(), onmessage: null as null | ((event: { data: unknown }) => void) }));
vi.mock("../webworkers/localBackendWorker.js?worker&inline", () => ({ default: class { constructor() { return worker; } } }));
import useLocalBackend from "./useLocalBackend";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("local request routing", () => {
  it("cancels density callbacks and drops old dataset responses", async () => {
    worker.postMessage.mockClear();
    const root = createRoot(document.createElement("div"));
    let backend: LocalBackend;
    function Harness({ upload }: { upload: Record<string, unknown> }) {
      backend = useLocalBackend(upload);
      return null;
    }
    const request: MetadataDensityRequest = { minY: 0, maxY: 1, height: 1, width: 36, outputHeight: 1, columnWidth: 24, fields: [] };
    try {
      await act(async () => root.render(<Harness upload={{ filename: "one.nwk" }} />));
      const callback = vi.fn();
      const cancel = backend!.queryMetadataDensity!(request, callback);
      const message = worker.postMessage.mock.calls.at(-1)![0];
      if (typeof cancel === "function") cancel();
      expect(worker.postMessage.mock.calls.at(-1)![0]).toEqual({ type: "cancel_metadata_density", key: message.key });
      worker.onmessage!({ data: { type: "metadata_density", data: { key: message.key, result: {} } } });
      expect(callback).not.toHaveBeenCalled();
      backend!.queryMetadataDensity!(request, callback);
      const old = worker.postMessage.mock.calls.at(-1)![0];
      await act(async () => root.render(<Harness upload={{ filename: "two.nwk" }} />));
      worker.onmessage!({ data: { type: "metadata_density", data: { key: old.key, result: {} } } });
      expect(callback).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); worker.postMessage.mockClear(); }
  });
  it("submits uploads before child queries and isolates detail and table callbacks", async () => {
    const root = createRoot(document.createElement("div"));
    let backend: LocalBackend, table: ReturnType<typeof useMetadataTable>;
    const selected = vi.fn(), hovered = vi.fn();
    function Child({ backend }: { backend: LocalBackend }) {
      table = useMetadataTable(backend.queryMetadataTable, { selectedNodeId: null, pageIndex: 0, fields: [], nameField: "name" });
      useEffect(() => { backend.getDetails(1, selected); backend.getDetails(2, hovered); }, [backend.getDetails]);
      return null;
    }
    function Harness({ upload }: { upload: Record<string, unknown> }) {
      backend = useLocalBackend(upload);
      return <Child backend={backend} />;
    }
    const send = (data: unknown) => act(async () => worker.onmessage!({ data }));
    try {
      await act(async () => root.render(<Harness upload={{ filename: "first.nwk" }} />));
      const first = worker.postMessage.mock.calls.map(([message]) => message);
      expect(first.map(message => message.type)).toEqual(["upload", "metadata_table", "details", "details"]);
      await send({ type: "details", key: first[3].key, data: { node_id: 2, mutations: [] } satisfies NodeDetails });
      await send({ type: "details", key: first[2].key, data: { node_id: 1, mutations: [] } satisfies NodeDetails });
      expect(selected.mock.calls[0][0].node_id).toBe(1);
      expect(hovered.mock.calls[0][0].node_id).toBe(2);
      await act(async () => root.render(<Harness upload={{ filename: "replacement.nwk" }} />));
      const replacement = worker.postMessage.mock.calls.slice(4).map(([message]) => message);
      expect(replacement.map(message => message.type)).toEqual(["upload", "metadata_table", "details", "details"]);
      const result = { total: 7, pageIndex: 0, fields: [], rows: [] };
      await send({ type: "metadata_table", key: first[1].key, data: result });
      expect(table!.response).toBeNull();
      await send({ type: "metadata_table", key: replacement[1].key, data: result });
      expect(table!.response).toEqual(result);
      expect(backend!.type).toBe("local");
    } finally { await act(async () => root.unmount()); }
  });
});
