import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { DynamicData } from "../types/backend";
import type { Settings } from "../types/settings";
import type { TreenomeState } from "../types/treenome";

const workers = vi.hoisted(() => [] as { onmessage: unknown; terminate: ReturnType<typeof vi.fn> }[]);
vi.mock("../webworkers/treenomeWorker.js?worker&inline", () => ({ default: class {
  onmessage = null;
  terminate = vi.fn();
  constructor() { workers.push(this); }
} }));
import useTreenomeLayerData from "./useTreenomeLayerData";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("recreates the Treenome worker during effect replay and terminates it on dataset release", async () => {
  const root = createRoot(document.createElement("div"));
  function Harness() {
    useTreenomeLayerData({} as DynamicData, { ntBounds: [0, 0], genomeSize: 0 } as TreenomeState,
      { treenomeEnabled: false, mutationTypesEnabled: { aa: false, nt: false } } as unknown as Settings, {});
    return null;
  }
  await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
  expect(workers).toHaveLength(2);
  expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  expect(workers[1].onmessage).toBeTypeOf("function");
  expect(workers[1].terminate).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  expect(workers[1].terminate).toHaveBeenCalledTimes(1);
  expect(workers[1].onmessage).toBeNull();
});
