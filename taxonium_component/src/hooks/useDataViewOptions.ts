import { useCallback, useMemo, useRef, useState } from "react";
import type { Backend } from "../types/backend";
import type { DataViewStatus } from "../types/dataViewStatus";

/** Share completed view summaries and commands, without issuing additional queries. */
export default function useDataViewOptions(backend: Backend, selected: string | number | null, source: string) {
  const mapToken = useMemo(() => ({}), [backend.type === "local" && backend.queryGeography, selected]);
  const timelineToken = useMemo(() => ({}), [backend.type === "local" && backend.queryTimeline, selected, source]);
  const current = useRef({ mapToken, timelineToken }); current.current = { mapToken, timelineToken };
  const [map, setMap] = useState<{ token: object; status: DataViewStatus }>();
  const [timeline, setTimeline] = useState<{ token: object; status: DataViewStatus }>();
  const reportMap = useCallback((status: DataViewStatus) => { if (current.current.mapToken === mapToken) setMap({ token: mapToken, status }); }, [mapToken]);
  const reportTimeline = useCallback((status: DataViewStatus) => { if (current.current.timelineToken === timelineToken) setTimeline({ token: timelineToken, status }); }, [timelineToken]);
  return { reportMap, reportTimeline, map: map?.token === mapToken ? map.status : undefined,
    timeline: timeline?.token === timelineToken ? timeline.status : undefined };
}
export type DataViewOptions = ReturnType<typeof useDataViewOptions>;
