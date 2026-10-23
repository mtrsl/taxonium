import type { GeographicRequest, GeographicResponse } from "../types/geography";
import type { EmbeddingRequest, EmbeddingResponse } from "../types/embedding";
import type { MetadataTableRequest, MetadataTableResponse } from "../types/metadataTable";
import { useCallback, useMemo, useLayoutEffect, useState, useRef } from "react";
import type {
  ImportStatus,
  Config,
  NodesResponse,
  NodeDetails,
  SearchResult,
  QueryBounds,
  LocalBackend,
  MetadataDensityResponse,
  MetadataDensityRequest,
  VisibleTipCountResponse,
} from "../types/backend";
import type {
  StatusData,
  QueryData,
  SearchData,
  ConfigData,
  DetailsData,
  ListData,
  NextStrainData,
  MetadataDensityData,
  VisibleTipCountData,
  LocalBackendMessage,
} from "../types/localBackendWorker";
import type { Node, Mutation } from "../types/node";

// test
//const workerPath = "../webworkers/localBackendWorker.js";

import workerSpec from "../webworkers/localBackendWorker.js?worker&inline";

//const url = new URL('../webworkers/localBackendWorker.js', import.meta.url)
//const getWorker = () => new Worker(url, { type: 'module' })

let worker = new workerSpec();
let activeImportId = 0;
let lastUpload: Record<string, unknown> | null = null;
let owner: object | null = null;

let onQueryReceipt: (receivedData: NodesResponse) => void = () => {};
let onStatusReceipt: (receivedData: StatusData) => void = (receivedData) => {
  /* STATUS update */
};

let onConfigReceipt: (receivedData: Config) => void = () => {};
const detailsSetters = new Map<string, (data: NodeDetails) => void>();
const geographicSetters = new Map<string, (data: GeographicResponse) => void>();
const embeddingSetters = new Map<string, (data: EmbeddingResponse) => void>();
const tableSetters = new Map<string, (data: MetadataTableResponse) => void>();
let onListReceipt: (receivedData: ListData["data"]) => void = () => {};
let onNextStrainReceipt: (receivedData: NextStrainData["data"]) => void = (
  receivedData
) => {
  // create a blob with this data and trigger download
  const blob = new Blob([JSON.stringify(receivedData)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = "nextstrain.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

let searchSetters: Record<string, (data: SearchResult) => void> = {};
let densityRequestId = 0;
let metadataDensitySetters: Record<
  string,
  (data: MetadataDensityResponse) => void
> = {};
let visibleTipCountSetters: Record<
  string,
  (data: VisibleTipCountResponse) => void
> = {};

const receiveMessage = (event: MessageEvent<LocalBackendMessage>) => {
  const data = event.data;
  switch (data.type) {
    case "status":
      if (data.importId !== undefined && data.importId !== activeImportId) break;
      onStatusReceipt(data);
      break;
    case "query":
      onQueryReceipt(data.data);
      break;
      case "search":
        if (data.data.key) {
          searchSetters[data.data.key]?.(data.data);
        }
        break;
    case "config":
      onConfigReceipt(data.data);
      break;
    case "details":
      detailsSetters.get(data.key)?.(data.data);
      detailsSetters.delete(data.key);
      break;
    case "list":
      onListReceipt(data.data);
      break;
    case "nextstrain":
      onNextStrainReceipt(data.data);
      break;
    case "geography":
      geographicSetters.get(data.key)?.(data.data);
      geographicSetters.delete(data.key);
      break;
    case "embedding":
      embeddingSetters.get(data.key)?.(data.data);
      embeddingSetters.delete(data.key);
      break;
    case "metadata_table":
      tableSetters.get(data.key)?.(data.data);
      tableSetters.delete(data.key);
      break;
    case "metadata_density":
      metadataDensitySetters[data.data.key]?.(data.data.result);
      break;
    case "visible_tip_count":
      visibleTipCountSetters[data.data.key]?.(data.data.result);
      break;
    default:
      break;
  }
};

worker.onmessage = receiveMessage;

function useLocalBackend(
  uploaded_data: Record<string, unknown> | null,
  onImportStatus?: (status: ImportStatus) => void
): LocalBackend {
  const [statusMessage, setStatusMessage] = useState<
    | { percentage?: number; message?: string | null }
    | null
  >({ message: null });
  const callback = useRef(onImportStatus);
  callback.current = onImportStatus;
  onStatusReceipt = (receivedData) => {
    const status = receivedData.data;
    const percentage = status.percentage === undefined ? undefined : Number(status.percentage);
    if (status.error && !callback.current) window.alert(String(status.error));
    callback.current?.({
      phase: status.error ? "error" : status.phase === "ready" ? "ready" : "processing",
      message: status.error ? String(status.error) : status.message ?? undefined,
      percentage: Number.isFinite(percentage) ? percentage : undefined,
    });
    const total_nodes = receivedData.data.total as number | undefined;
    if (total_nodes && total_nodes > 6000000) {
      if (1) {
        window.alert(
          "This is a large tree which may use too much memory to run in the web browser. If the page crashes you might want to try the Taxonium desktop app."
        );
      }
    }
    setStatusMessage(receivedData.data);
  };
  // Submit replacement data before child components issue passive-effect queries.
  useLayoutEffect(() => {
    detailsSetters.clear();
    tableSetters.clear();
    geographicSetters.clear();
    embeddingSetters.clear();
    metadataDensitySetters = {};
    visibleTipCountSetters = {};
    if (!uploaded_data) return;
    const token = {};
    owner = token;
    worker.onerror = event => {
      if (owner !== token) return;
      event.preventDefault();
      onStatusReceipt({ type: "status", data: { error: event.message || "Unable to process dataset" } });
    };
    // Effect replay must not repost buffers which were already transferred.
    if (lastUpload !== uploaded_data) {
      lastUpload = uploaded_data;
      activeImportId++;
      const buffers = new Set<ArrayBuffer>();
      if (uploaded_data.transferOwnership) {
        for (const input of [uploaded_data, uploaded_data.metadata, uploaded_data.embedding]) {
          const data = (input as { data?: unknown } | undefined)?.data;
          if (data instanceof ArrayBuffer) buffers.add(data);
        }
      }
      worker.postMessage({ type: "upload", data: uploaded_data, importId: activeImportId }, [...buffers]);
    }
    return () => {
      owner = null;
      // Defer termination across StrictMode's immediate effect replay.
      queueMicrotask(() => {
        if (owner !== null) return;
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        worker = new workerSpec();
        worker.onmessage = receiveMessage;
        lastUpload = null;
        activeImportId++;
        detailsSetters.clear(); tableSetters.clear(); geographicSetters.clear(); embeddingSetters.clear();
        searchSetters = {}; metadataDensitySetters = {}; visibleTipCountSetters = {};
        onQueryReceipt = () => {}; onConfigReceipt = () => {}; onStatusReceipt = () => {}; onListReceipt = () => {};
      });
    };
  }, [uploaded_data]);

  const queryNodes = useCallback(
    async (
      boundsForQueries: QueryBounds | null,
      setResult: (res: NodesResponse) => void,
      setTriggerRefresh: (v: Record<string, unknown>) => void,
      config: Config
    ) => {
      
      worker.postMessage({
        type: "query",
        bounds: boundsForQueries,
      });
      onQueryReceipt = (receivedData) => {
        receivedData.nodes.forEach((node: Node) => {
          if (!config.mutations) return;
          if (node.node_id === config.rootId) {
            node.mutations = config.rootMutations
              .map((x) => (typeof x === "number" ? config.mutations?.[x] : x))
              .filter(Boolean) as Mutation[];
          } else {
            node.mutations = node.mutations
              .map((mutation: Mutation | number) =>
                typeof mutation === "number" ? config.mutations?.[mutation] : mutation
              )
              .filter(Boolean) as Mutation[];
          }
        });
        setResult(receivedData);
      };
    },
    []
  );

  const singleSearch = useCallback(
    (
      singleSearch: string,
      boundsForQueries: QueryBounds | null,
      setResult: (res: SearchResult) => void
    ) => {
      const key = JSON.parse(singleSearch).key;
      worker.postMessage({
        type: "search",
        search: singleSearch,
        bounds: boundsForQueries,
      });

      searchSetters[key] = (receivedData) => {
        setResult(receivedData);
      };
      return {
        abortController: {
          abort: () => {},
        },
      };
    },
    []
  );

  const getDetails = useCallback(
    (node_id: string | number, setResult: (res: NodeDetails) => void) => {
      const key = String(++densityRequestId);
      detailsSetters.set(key, setResult);
      worker.postMessage({ type: "details", key, node_id });
    },
    [uploaded_data]
  );

  const queryGeography = useCallback((request: GeographicRequest,
    callback: (response: GeographicResponse) => void) => {
    const key = String(++densityRequestId);
    const timer = setTimeout(() => {
      if (!geographicSetters.has(key)) return;
      geographicSetters.delete(key);
      worker.postMessage({ type: "cancel_geography", key });
      callback({ error: "Map request timed out. Please retry." });
    }, 60000);
    geographicSetters.set(key, result => { clearTimeout(timer); callback(result); });
    worker.postMessage({ type: "geography", key, request });
    return () => { clearTimeout(timer); geographicSetters.delete(key); worker.postMessage({ type: "cancel_geography", key }); };
  }, [uploaded_data]);

  const queryEmbedding = useCallback((request: EmbeddingRequest,
    callback: (response: EmbeddingResponse) => void) => {
    const key = String(++densityRequestId);
    const timer = setTimeout(() => {
      if (!embeddingSetters.has(key)) return;
      embeddingSetters.delete(key);
      worker.postMessage({ type: "cancel_embedding", key });
      callback({ error: "Embedding request timed out. Please retry." });
    }, 60000);
    embeddingSetters.set(key, result => { clearTimeout(timer); callback(result); });
    worker.postMessage({ type: "embedding", key, request });
    return () => { clearTimeout(timer); embeddingSetters.delete(key); worker.postMessage({ type: "cancel_embedding", key }); };
  }, [uploaded_data]);

  const queryMetadataTable = useCallback((request: MetadataTableRequest,
    callback: (response: MetadataTableResponse) => void) => {
    const key = String(++densityRequestId);
    const timer = setTimeout(() => {
      tableSetters.delete(key);
      callback({ error: "Metadata request timed out. Please retry." });
    }, 30000);
    tableSetters.set(key, result => { clearTimeout(timer); callback(result); });
    worker.postMessage({ type: "metadata_table", key, request });
    return () => { clearTimeout(timer); tableSetters.delete(key); };
  }, [uploaded_data]);

  const getConfig = useCallback((setResult: (res: Config) => void) => {
    worker.postMessage({
      type: "config",
    });

    onConfigReceipt = (receivedData) => {
      setResult(receivedData);
    };
  }, [uploaded_data]);

  const getTipAtts = useCallback(
    (
      nodeId: string | number,
      selectedKey: string,
      callback: (err: unknown, data: unknown) => void
    ) => {
    worker.postMessage({
      type: "list",
      node_id: nodeId,
      key: selectedKey,
    });

    onListReceipt = (receivedData) => {
      callback(null, receivedData);
    };
  }, []);

  const getNextstrainJson = useCallback((nodeId: string | number, config: Config) => {
    worker.postMessage({
      type: "nextstrain",
      node_id: nodeId,
      config: config,
    });
  }, []);

  const queryMetadataDensity = useCallback(
    (
      args: MetadataDensityRequest,
      callback: (res: MetadataDensityResponse) => void
    ) => {
      const key = String(++densityRequestId);
      worker.postMessage({
        type: "metadata_density",
        key,
        ...args,
      });

      metadataDensitySetters[key] = (receivedData) => {
        if (!receivedData.cancelled) callback(receivedData);
        delete metadataDensitySetters[key];
      };
      return () => {
        delete metadataDensitySetters[key];
        worker.postMessage({ type: "cancel_metadata_density", key });
      };
    },
    [uploaded_data]
  );

  const queryVisibleTipCount = useCallback(
    (
      args: {
        minY: number;
        maxY: number;
      },
      callback: (res: VisibleTipCountResponse) => void
    ) => {
      const key = String(++densityRequestId);
      worker.postMessage({
        type: "visible_tip_count",
        key,
        ...args,
      });

      visibleTipCountSetters[key] = (receivedData) => {
        callback(receivedData);
        delete visibleTipCountSetters[key];
      };
    },
    []
  );

  return useMemo(() => {
    return {
      queryNodes,
      singleSearch,
      getDetails,
      getConfig,
      statusMessage,
      setStatusMessage,
      getTipAtts,
      queryMetadataTable,
      queryGeography,
      queryEmbedding,
      queryMetadataDensity,
      queryVisibleTipCount,
      getNextstrainJson,
      type: "local",
    };
  }, [
    queryNodes,
    singleSearch,
    getDetails,
    getConfig,
    statusMessage,
    setStatusMessage,
    getTipAtts,
    queryMetadataTable,
    queryGeography,
    queryEmbedding,
    queryMetadataDensity,
    queryVisibleTipCount,
    getNextstrainJson,
  ]);
}

export default useLocalBackend;
