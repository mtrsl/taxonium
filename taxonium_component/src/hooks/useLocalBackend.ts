import type { MetadataTableRequest, MetadataTableResponse } from "../types/metadataTable";
import { useCallback, useMemo, useLayoutEffect, useState } from "react";
import type {
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

const worker = new workerSpec();

let onQueryReceipt: (receivedData: NodesResponse) => void = () => {};
let onStatusReceipt: (receivedData: StatusData) => void = (receivedData) => {
  /* STATUS update */
};

let onConfigReceipt: (receivedData: Config) => void = () => {};
const detailsSetters = new Map<string, (data: NodeDetails) => void>();
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

worker.onmessage = (event: MessageEvent<LocalBackendMessage>) => {
  const data = event.data;
  switch (data.type) {
    case "status":
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

function useLocalBackend(
  uploaded_data: Record<string, unknown> | null
): LocalBackend {
  const [statusMessage, setStatusMessage] = useState<
    | { percentage?: number; message?: string | null }
    | null
  >({ message: null });
  onStatusReceipt = (receivedData) => {
    if (receivedData.data.error) {
      window.alert(receivedData.data.error);
      console.log("ERROR33:", receivedData.data.error);
    }
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
    metadataDensitySetters = {};
    visibleTipCountSetters = {};
    worker.postMessage({
      type: "upload",
      data: uploaded_data,
    });
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
    queryMetadataDensity,
    queryVisibleTipCount,
    getNextstrainJson,
  ]);
}

export default useLocalBackend;
