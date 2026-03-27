import { useState, useMemo, useCallback, useEffect } from "react";
import { OrthographicView, OrthographicController } from "@deck.gl/core";
import type { OrthographicViewProps } from "@deck.gl/core";
import type { Settings } from "../types/settings";
import type { DeckSize } from "../types/common";
import type { ViewState } from "../types/view";

interface ViewStateChangeParameters<ViewStateT> {
  viewId: string;
  viewState: ViewStateT;
  interactionState: Record<string, unknown>;
  oldViewState?: ViewStateT;
}

interface StyledViewProps extends OrthographicViewProps {
  borderWidth?: string;
}

const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const defaultViewState: ViewState = {
  zoom: [0, -2],
  target: [window.screen.width < 600 ? 500 : 1400, 1000],
  pitch: 0,
  bearing: 0,
  minimap: { zoom: -3, target: [250, 1000] }
};

type ViewStateType = ViewState;

const getZoomY = (zoom: number | [number, number]) =>
  Array.isArray(zoom) ? zoom[1] : zoom;

interface UseViewProps {
  settings: Settings;
  deckSize: DeckSize | null;
  mouseDownIsMinimap: boolean;
  metadataMatrixWidth?: number;
}

const useView = ({
  settings,
  deckSize,
  mouseDownIsMinimap,
  metadataMatrixWidth = 0,
}: UseViewProps) => {
  const [mouseXY, setMouseXY] = useState([0, 0]);
  const [zoomAxis, setZoomAxis] = useState("Y");

  const controllerProps = useMemo(
    () => ({
      type: OrthographicController,
      scrollZoom: true,
      zoomAxis: "Y",
    }),
    []
  );

  const layout = useMemo(() => {
    const totalWidth =
      deckSize && Number.isFinite(deckSize.width) ? deckSize.width : window.innerWidth;
    const mainAreaWidth = settings.treenomeEnabled ? totalWidth * 0.4 : totalWidth;
    const clampedMetadataWidth = Math.max(
      0,
      Math.min(metadataMatrixWidth, Math.max(mainAreaWidth - 80, 0))
    );
    const mainViewWidth = Math.max(mainAreaWidth - clampedMetadataWidth, 0);
    const metadataViewX = mainViewWidth;

    return {
      totalWidth,
      mainAreaWidth,
      mainViewWidth,
      metadataViewX,
      metadataMatrixWidth: clampedMetadataWidth,
    };
  }, [deckSize, metadataMatrixWidth, settings.treenomeEnabled]);

  const deriveViewState = useCallback(
    (canonicalViewState: ViewStateType): ViewStateType => {
      const zoomY = getZoomY(canonicalViewState.zoom);
      return {
        ...canonicalViewState,
        minimap: { zoom: -3, target: [250, 1000] },
        "browser-main": {
          zoom: [-3, zoomY],
          target: [0, canonicalViewState.target[1]],
        },
        "metadata-matrix": {
          zoom: [0, zoomY],
          target: [layout.metadataMatrixWidth / 2, canonicalViewState.target[1]],
          pitch: 0,
          bearing: 0,
        },
      };
    },
    [layout.metadataMatrixWidth]
  );

  const [viewState, setViewState] = useState<ViewStateType>(() =>
    deriveViewState(defaultViewState)
  );

  useEffect(() => {
    setViewState((currentViewState) => deriveViewState(currentViewState));
  }, [deriveViewState]);

  const baseViewState = useMemo(() => ({ ...viewState }), [viewState]);

  const views = useMemo(() => {
    const vs = [];
    if (settings.minimapEnabled && !settings.treenomeEnabled) {
      vs.push(
        new OrthographicView({
          id: "minimap",
          x: "79%",
          y: "1%",
          width: "20%",
          height: "35%",
          borderWidth: "1px",
          controller: controllerProps,
        } as StyledViewProps)
      );
    }
    if (settings.treenomeEnabled) {
      vs.push(
        new OrthographicView({
          id: "browser-axis",
          controller: false,
          x: "40%",
          y: "0%",
          width: "60%",
        } as StyledViewProps),
        new OrthographicView({
          id: "browser-main",
          controller: controllerProps,
          x: "40%",
          width: "60%",
        } as StyledViewProps)
      );
    }
    vs.push(
      new OrthographicView({
        id: "main",
        controller: controllerProps,
        width: layout.mainViewWidth,
        initialViewState: viewState,
      } as StyledViewProps)
    );
    if (layout.metadataMatrixWidth > 0) {
      vs.push(
        new OrthographicView({
          id: "metadata-matrix",
          controller: false,
          x: layout.metadataViewX,
          width: layout.metadataMatrixWidth,
          initialViewState: viewState,
        } as StyledViewProps)
      );
    }
    if (settings.treenomeEnabled) {
      vs.push(
        new OrthographicView({
          id: "main-overlay",
          controller: controllerProps,
          width: "100%",
          initialViewState: viewState,
        } as StyledViewProps)
      );
    }
    return vs;
  }, [controllerProps, layout, viewState, settings]);

  const onViewStateChange = useCallback(
    ({
      viewState: newViewState,
      viewId,
      requestIsFromMinimapPan,
    }: ViewStateChangeParameters<ViewStateType> & {
      requestIsFromMinimapPan?: boolean;
    }) => {
      if (mouseDownIsMinimap && !requestIsFromMinimapPan) {
        return false;
      }

      if (
        viewId &&
        viewId !== "main" &&
        viewId !== "minimap" &&
        viewId !== "browser-main" &&
        !requestIsFromMinimapPan
      ) {
        return viewState;
      }

      const canonicalViewState: ViewStateType =
        viewId === "browser-main"
          ? {
              ...viewState,
              zoom: [
                Array.isArray(viewState.zoom) ? viewState.zoom[0] : viewState.zoom,
                getZoomY(newViewState.zoom),
              ],
              target: [viewState.target[0], newViewState.target[1] as number],
              pitch: viewState.pitch,
              bearing: viewState.bearing,
            }
          : {
              ...viewState,
              zoom: newViewState.zoom,
              target: newViewState.target as [number, number],
              pitch: newViewState.pitch ?? viewState.pitch,
              bearing: newViewState.bearing ?? viewState.bearing,
            };
      const derivedViewState = deriveViewState(canonicalViewState);
      setViewState(derivedViewState);

      return derivedViewState;
    },
    [deriveViewState, mouseDownIsMinimap, viewState]
  );

  const zoomIncrement = useCallback(
    (increment: number, axis: string | undefined = zoomAxis) => {
        setViewState((vs: ViewStateType) => {
          const newZoom = [...(vs.zoom as [number, number])];
          if (axis === "X") {
            newZoom[0] = newZoom[0] + increment;
          } else if (axis === "Y") {
            newZoom[1] = newZoom[1] + increment;
          } else {
            newZoom[0] = newZoom[0] + increment;
            newZoom[1] = newZoom[1] + increment;
          }
          return deriveViewState({ ...vs, zoom: newZoom } as ViewStateType);
        });
    },
    [deriveViewState, zoomAxis]
  );

  const zoomReset = useCallback(() => {
    setViewState(deriveViewState(defaultViewState));
  }, [deriveViewState]);

  return {
    viewState,
    setViewState,
    onViewStateChange,
    views,
    zoomAxis,
    setZoomAxis,
    modelMatrix: identityMatrix,
    zoomIncrement,
    xzoom: 0,
    mouseXY,
    setMouseXY,
    baseViewState,
    zoomReset,
    layout,
  };
};

export default useView;

export interface View {
  viewState: ViewState;
  setViewState: React.Dispatch<React.SetStateAction<ViewState>>;
  onViewStateChange: any;
  views: any;
  zoomAxis: string;
  setZoomAxis: React.Dispatch<React.SetStateAction<string>>;
  modelMatrix: number[];
  zoomIncrement: (increment: number, axis?: string) => void;
  xzoom: number;
  mouseXY: number[];
  setMouseXY: React.Dispatch<React.SetStateAction<number[]>>;
  baseViewState: ViewState;
  zoomReset: () => void;
  layout: {
    totalWidth: number;
    mainAreaWidth: number;
    mainViewWidth: number;
    metadataViewX: number;
    metadataMatrixWidth: number;
  };
}
