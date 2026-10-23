import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import axios from "axios";
import type { Backend, Config, NodesResponse } from "../types/backend";

const worker = vi.hoisted(() => ({ postMessage: vi.fn(), terminate: vi.fn(), onmessage: null }));
vi.mock("../webworkers/localBackendWorker.js?worker&inline", () => ({ default: class { constructor() { return worker; } } }));
import useBackend from "./useBackend";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("preserves explicit HTTP backend configuration, queries and hydrated mutations", async () => {
  const root = createRoot(document.createElement("div"));
  let backend: Backend | null = null;
  const config = { rootId: 0, rootMutations: [], useHydratedMutations: true, mutations: [] } as unknown as Config;
  const nodes = { nodes: [{ node_id: 0, mutations: [] }] } as unknown as NodesResponse;
  const get = vi.spyOn(axios, "get").mockImplementation(async url => ({ data: String(url).includes("/config/") ? config : nodes }));
  function Harness() { backend = useBackend("http://localhost:9000", "session", null); return null; }
  try {
    await act(async () => root.render(<Harness />));
    expect(backend!.type).toBe("server");
    expect(worker.postMessage).not.toHaveBeenCalled();
    const configuration = vi.fn(), result = vi.fn();
    await act(async () => { backend!.getConfig(configuration); });
    expect(configuration).toHaveBeenCalledWith(config);
    await act(async () => { backend!.queryNodes(null, result, vi.fn(), config); });
    expect(result).toHaveBeenCalledWith(nodes);
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:9000/config/?sid=session", "http://localhost:9000/nodes/?type=leaves&sid=session",
    ]);
  } finally { await act(async () => root.unmount()); get.mockRestore(); }
});
