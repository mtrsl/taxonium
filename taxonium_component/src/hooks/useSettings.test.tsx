import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useSettings } from "./useSettings";
import type { Query } from "../types/query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("stores orientation in existing query state and retains it across Treenome changes", async () => {
  const root = createRoot(document.createElement("div"));
  let settings: ReturnType<typeof useSettings>;
  let query: Query;
  function Harness() {
    const [state, setState] = useState<Query>({ treeLayout: "rotated", metadataMatrix: '{"fields":["meta_id"]}' });
    query = state;
    settings = useSettings({ query: state, updateQuery: changes => setState(previous => ({ ...previous, ...changes })) });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(settings!.treeLayout).toBe("rotated");
    await act(async () => settings!.setTreenomeEnabled(true));
    expect(query!.treeLayout).toBe("rotated");
    await act(async () => settings!.setTreenomeEnabled(false));
    expect(settings!.treeLayout).toBe("rotated");
    await act(async () => settings!.setTreeLayout!("standard"));
    expect(query!.treeLayout).toBe("standard");
    expect(query!.metadataMatrix).toBe('{"fields":["meta_id"]}');
  } finally { await act(async () => root.unmount()); }
});
