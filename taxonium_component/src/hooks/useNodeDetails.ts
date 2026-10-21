import { useState, useCallback, useRef, useEffect } from "react";
import type { Backend, NodeDetails } from "../types/backend";

function useNodeDetails(nickname: string, backend: Backend) {
  const { getDetails } = backend;
  const [nodeDetails, setDetails] = useState<NodeDetails | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | number | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  const clearNodeDetails = useCallback(() => {
    generation.current++;
    if (timeout.current) clearTimeout(timeout.current);
    setSelectedNodeId(null);
    setDetails(null);
  }, []);

  useEffect(() => {
    clearNodeDetails();
    return () => {
      generation.current++;
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [getDetails, clearNodeDetails]);

  const getNodeDetails = useCallback((node_id: string | number) => {
    const current = ++generation.current;
    if (timeout.current) clearTimeout(timeout.current);
    setSelectedNodeId(node_id);
    timeout.current = setTimeout(() => {
      getDetails(node_id, details => {
        if (current === generation.current) setDetails(details);
      });
    }, 50);
  }, [getDetails]);

  const setNodeDetails = useCallback((details: NodeDetails | null) => {
    generation.current++;
    if (timeout.current) clearTimeout(timeout.current);
    setSelectedNodeId(details?.node_id ?? null);
    setDetails(details);
  }, []);

  return { selectedNodeId, nodeDetails, getNodeDetails, clearNodeDetails, setNodeDetails };
}

export default useNodeDetails;
