import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Backend, NodeDetails } from "../types/backend";
import useNodeDetails from "./useNodeDetails";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("shared tree selection", () => {
  it("selects immediately, cancels debounce on clear and rejects out-of-order and old dataset details", async () => {
    vi.useFakeTimers();
    const callbacks: ((details: NodeDetails) => void)[] = [];
    const getDetails = vi.fn((_id, callback) => callbacks.push(callback));
    let state: ReturnType<typeof useNodeDetails>;
    const root = createRoot(document.createElement("div"));
    function Harness({ get = getDetails }) {
      state = useNodeDetails("selected", { getDetails: get } as unknown as Backend);
      return null;
    }
    const details = (node_id: number): NodeDetails => ({ node_id, name: `node-${node_id}`, mutations: [] });
    try {
      await act(async () => root.render(<Harness />));
      await act(async () => state!.getNodeDetails(1));
      expect(state!.selectedNodeId).toBe(1);
      expect(getDetails).not.toHaveBeenCalled();
      await act(async () => state!.clearNodeDetails());
      await act(async () => vi.advanceTimersByTime(100));
      expect(getDetails).not.toHaveBeenCalled();
      await act(async () => { state!.getNodeDetails(2); vi.advanceTimersByTime(50); });
      await act(async () => { state!.getNodeDetails(3); vi.advanceTimersByTime(50); });
      await act(async () => callbacks[1](details(3)));
      await act(async () => callbacks[0](details(2)));
      expect(state!.nodeDetails?.node_id).toBe(3);
      await act(async () => { state!.getNodeDetails(4); vi.advanceTimersByTime(50); });
      await act(async () => state!.clearNodeDetails());
      await act(async () => callbacks[2](details(4)));
      expect(state!.nodeDetails).toBeNull();
      expect(state!.selectedNodeId).toBeNull();
      await act(async () => { state!.getNodeDetails(5); vi.advanceTimersByTime(50); });
      await act(async () => root.render(<Harness get={vi.fn()} />));
      await act(async () => callbacks[3](details(5)));
      expect(state!.nodeDetails).toBeNull();
      expect(state!.selectedNodeId).toBeNull();
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
    }
  });
});
