import {
  BitmapLayer,
  LineLayer,
  ScatterplotLayer,
  PolygonLayer,
  TextLayer,
  SolidPolygonLayer,
} from "@deck.gl/layers";

import { useMemo, useCallback, useEffect, useState } from "react";
import computeBounds from "../utils/computeBounds";
import useTreenomeLayers from "./useTreenomeLayers";
import getSVGfunction from "../utils/deckglToSvg";
import type { Node } from "../types/node";
import type {
  NodeLookupData,
  Config,
  DynamicData,
  Backend,
  MetadataDensityResponse,
  VisibleTipCountResponse,
} from "../types/backend";
import type { DeckSize, HoverInfo } from "../types/common";
import type { ColorHook, ColorBy } from "../types/color";
import type { Settings } from "../types/settings";
import type { SearchState } from "../types/search";
import type { TreenomeState } from "../types/treenome";
import type { HoverDetailsState, SelectedDetails } from "../types/ui";
import type { ViewState } from "../types/view";
import type {
  MetadataMatrix,
  MetadataMatrixCell,
  MetadataMatrixRenderMode,
} from "../types/metadataMatrix";

const blendWithBackground = (
  color: [number, number, number],
  fraction: number
  ,
  background: [number, number, number, number]
): [number, number, number, number] => {
  const clampedFraction = Math.max(0, Math.min(1, fraction));
  const mix = 1 - clampedFraction;
  return [
    Math.round(color[0] * clampedFraction + background[0] * mix),
    Math.round(color[1] * clampedFraction + background[1] * mix),
    Math.round(color[2] * clampedFraction + background[2] * mix),
    Math.round(background[3] + clampedFraction * (255 - background[3])),
  ];
};

const blendRgbTowardBackground = (
  color: [number, number, number],
  fraction: number,
  background: [number, number, number, number]
): [number, number, number, number] => {
  const clampedFraction = Math.max(0, Math.min(1, fraction));
  const mix = 1 - clampedFraction;
  return [
    Math.round(color[0] * clampedFraction + background[0] * mix),
    Math.round(color[1] * clampedFraction + background[1] * mix),
    Math.round(color[2] * clampedFraction + background[2] * mix),
    255,
  ];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const METADATA_BACKGROUND_RGBA: [number, number, number, number] = [
  244, 244, 244, 235,
];

const getBoxRectangleTransitionProgress = (pixelsPerTip: number) =>
  clamp((pixelsPerTip - 8) / 8, 0, 1);

const getNextLocalMetadataRenderMode = (
  pixelsPerTip: number,
  previousMode: MetadataMatrixRenderMode
): MetadataMatrixRenderMode => {
  if (previousMode === "boxes") {
    if (pixelsPerTip < 12) {
      return "rectangles";
    }
    return "boxes";
  }

  if (previousMode === "rectangles") {
    if (pixelsPerTip >= 14) {
      return "boxes";
    }
    if (pixelsPerTip < 1.6) {
      return "density";
    }
    return "rectangles";
  }

  if (pixelsPerTip >= 14) {
    return "boxes";
  }
  if (pixelsPerTip >= 2.0) {
    return "rectangles";
  }
  return "density";
};

const createMetadataDensityCanvas = ({
  width,
  height,
  columnWidth,
  matrixFields,
  tipNodes,
  densityData,
  allowTipNodeFallback,
  minY,
  maxY,
  isTruthyValue,
}: {
  width: number;
  height: number;
  columnWidth: number;
  matrixFields: MetadataMatrix["matrixFields"];
  tipNodes?: Node[];
  densityData?: MetadataDensityResponse | null;
  allowTipNodeFallback?: boolean;
  minY: number;
  maxY: number;
  isTruthyValue: (value: unknown) => boolean;
}): HTMLCanvasElement | null => {
  if (
    typeof document === "undefined" ||
    width <= 0 ||
    height <= 0 ||
    matrixFields.length === 0 ||
    maxY <= minY
  ) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const imageData = context.createImageData(width, height);
  const { data } = imageData;

  for (let pixelIndex = 0; pixelIndex < data.length; pixelIndex += 4) {
    data[pixelIndex] = METADATA_BACKGROUND_RGBA[0];
    data[pixelIndex + 1] = METADATA_BACKGROUND_RGBA[1];
    data[pixelIndex + 2] = METADATA_BACKGROUND_RGBA[2];
    data[pixelIndex + 3] = METADATA_BACKGROUND_RGBA[3];
  }

  matrixFields.forEach((field, fieldIndex) => {
    const xStart = Math.max(0, Math.floor(12 + fieldIndex * columnWidth + 1));
    const xEnd = Math.min(
      width,
      Math.ceil(12 + (fieldIndex + 1) * columnWidth - 1)
    );

    if (xEnd <= xStart) {
      return;
    }

    const trueCounts = new Uint32Array(height);
    const totalCounts = new Uint32Array(height);
    const precomputedField = densityData?.fields[field.field];

    if (
      precomputedField &&
      precomputedField.trueCounts.length > 0 &&
      precomputedField.totalCounts.length > 0
    ) {
      const sourceHeight = Math.min(
        precomputedField.trueCounts.length,
        precomputedField.totalCounts.length
      );
      for (let rowIndex = 0; rowIndex < height; rowIndex++) {
        const sourceRow = clamp(
          Math.floor((rowIndex * sourceHeight) / Math.max(1, height)),
          0,
          sourceHeight - 1
        );
        trueCounts[rowIndex] = precomputedField.trueCounts[sourceRow];
        totalCounts[rowIndex] = precomputedField.totalCounts[sourceRow];
      }
    } else if (allowTipNodeFallback && tipNodes && tipNodes.length > 0) {
      for (let nodeIndex = 0; nodeIndex < tipNodes.length; nodeIndex++) {
        const node = tipNodes[nodeIndex];
        const intervalStartY =
          nodeIndex === 0 ? minY : (tipNodes[nodeIndex - 1].y + node.y) / 2;
        const intervalEndY =
          nodeIndex === tipNodes.length - 1
            ? maxY
            : (node.y + tipNodes[nodeIndex + 1].y) / 2;

        const intervalStartNormalized = (intervalStartY - minY) / (maxY - minY);
        const intervalEndNormalized = (intervalEndY - minY) / (maxY - minY);
        const startRow = clamp(
          height - 1 - Math.floor(intervalEndNormalized * height),
          0,
          height - 1
        );
        const endRow = clamp(
          height - 1 - Math.floor(intervalStartNormalized * height),
          0,
          height - 1
        );

        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
          totalCounts[rowIndex] += 1;
          if (isTruthyValue(node[field.field])) {
            trueCounts[rowIndex] += 1;
          }
        }
      }
    }

    for (let rowIndex = 0; rowIndex < height; rowIndex++) {
      const totalCount = totalCounts[rowIndex];
      const color =
        totalCount === 0
          ? METADATA_BACKGROUND_RGBA
          : blendWithBackground(
              field.color,
              trueCounts[rowIndex] / totalCount,
              METADATA_BACKGROUND_RGBA
            );

      for (let x = xStart; x < xEnd; x++) {
        const pixelOffset = (rowIndex * width + x) * 4;
        data[pixelOffset] = color[0];
        data[pixelOffset + 1] = color[1];
        data[pixelOffset + 2] = color[2];
        data[pixelOffset + 3] = color[3];
      }
    }
  });

  context.putImageData(imageData, 0, 0);
  return canvas;
};

const getKeyStuff = (
  getNodeColorField: (node: Node, data: NodeLookupData) => string | number,
  colorByField: string,
  dataset: NodeLookupData,
  toRGB: (value: string | number) => [number, number, number],
) => {
  const counts: Record<string, number> = {};
  for (const node of dataset.nodes) {
    const value = getNodeColorField(node, dataset);
    const key = String(value);
    if (key in counts) {
      counts[key]++;
    } else {
      counts[key] = 1;
    }
  }
  const keys = Object.keys(counts);
  const output: Array<{
    value: string;
    count: number;
    color: [number, number, number];
  }> = [];
  for (const key of keys) {
    output.push({ value: key, count: counts[key], color: toRGB(key) });
  }
  return output;
};

interface UseLayersProps {
  backend: Backend;
  data: DynamicData;
  search: SearchState;
  viewState: ViewState;
  deckSize: DeckSize | null;
  colorHook: ColorHook;
  setHoverInfo: (info: HoverInfo<Node> | null) => void;
  hoverInfo: HoverInfo<Node> | null;
  colorBy: ColorBy;
  metadataMatrix: MetadataMatrix;
  xType: string;
  modelMatrix: number[];
  selectedDetails: SelectedDetails;
  settings: Settings;
  isCurrentlyOutsideBounds: boolean;
  config: Config;
  treenomeState: TreenomeState;
  treenomeReferenceInfo: Record<"aa" | "nt", Record<string, string>> | null;
  setTreenomeReferenceInfo: (
    info: Record<"aa" | "nt", Record<string, string>>,
  ) => void;
  hoveredKey: string | null;
}

const useLayers = ({
  backend,
  data,
  search,
  viewState,
  deckSize,
  colorHook,
  setHoverInfo,
  hoverInfo,
  colorBy,
  metadataMatrix,
  xType,
  modelMatrix,
  selectedDetails,
  settings,
  isCurrentlyOutsideBounds,
  config,
  treenomeState,
  treenomeReferenceInfo,
  setTreenomeReferenceInfo,
  hoveredKey,
}: UseLayersProps) => {
  const lineColor = settings.lineColor;
  const getNodeColorField = colorBy.getNodeColorField;
  const colorByField = colorBy.colorByField;

  const { toRGB } = colorHook;

  const layers = [];

  // Treenome Browser layers
  const treenomeLayers = useTreenomeLayers(
    treenomeState as any,
    data,
    viewState,
    colorHook,
    setHoverInfo as (info: unknown) => void,
    settings,
    treenomeReferenceInfo as any,
    setTreenomeReferenceInfo,
    selectedDetails as any,
  );
  layers.push(...treenomeLayers);

  const getX = useCallback((node: Node) => node[xType], [xType]);

  const detailed_data = useMemo(() => {
    if (data.data && data.data.nodes) {
      data.data.nodes.forEach((node: Node) => {
        node.parent_x = getX(data.data.nodeLookup[node.parent_id!]);
        node.parent_y = data.data.nodeLookup[node.parent_id!].y;
      });
      return data.data;
    } else {
      return { nodes: [], nodeLookup: {} };
    }
  }, [data.data, getX]);

  const keyStuff = useMemo(() => {
    return getKeyStuff(getNodeColorField, colorByField, detailed_data, toRGB);
  }, [detailed_data, getNodeColorField, colorByField, toRGB]);

  const clade_accessor = "pango";

  const clade_data = useMemo(() => {
    const initial_data = detailed_data.nodes.filter(
      (n: Node) => n.clades && n.clades[clade_accessor],
    );

    const rev_sorted_by_num_tips = initial_data.sort(
      (a: Node, b: Node) => b.num_tips - a.num_tips,
    );

    // pick top settings.minTipsForCladeText
    const top_nodes = rev_sorted_by_num_tips.slice(0, settings.maxCladeTexts);
    return top_nodes;
  }, [detailed_data.nodes, settings.maxCladeTexts, clade_accessor]);

  const base_data = useMemo(() => {
    if (data.base_data && data.base_data.nodes) {
      const baseLookup = data.base_data.nodeLookup;
      data.base_data.nodes.forEach((node: Node) => {
        const parentNode = baseLookup[node.parent_id!];
        node.parent_x = getX(parentNode);
        node.parent_y = parentNode.y;
      });
      return {
        nodes: data.base_data.nodes,
        nodeLookup: baseLookup,
      };
    }
    return { nodes: [], nodeLookup: {} };
  }, [data.base_data, getX]);

  const detailed_scatter_data = useMemo(() => {
    return detailed_data.nodes.filter(
      (node: Node) =>
        node.is_tip ||
        (node.is_tip === undefined && node.num_tips === 1) ||
        settings.displayPointsForInternalNodes,
    );
  }, [detailed_data, settings.displayPointsForInternalNodes]);

  const minimap_scatter_data = useMemo(() => {
    return base_data
      ? base_data.nodes.filter(
          (node: Node) =>
            node.is_tip ||
            (node.is_tip === undefined && node.num_tips === 1) ||
            settings.displayPointsForInternalNodes,
        )
      : [];
  }, [base_data, settings.displayPointsForInternalNodes]);

  const computedViewState = useMemo(
    () => computeBounds({ ...viewState }, deckSize),
    [viewState, deckSize],
  );

  const zoomY = Array.isArray(viewState.zoom)
    ? viewState.zoom[1]
    : (viewState.zoom as number);
  const yPixelsPerWorldUnit = 2 ** zoomY;
  const pixelToWorldY = useCallback(
    (pixels: number) => pixels / yPixelsPerWorldUnit,
    [yPixelsPerWorldUnit]
  );

  const outer_bounds = [
    [-100000, -100000],
    [100000, -100000],
    [1000000, 1000000],
    [-100000, 1000000],
    [-100000, -100000],
  ];
  const inner_bounds = [
    [
      computedViewState.min_x,
      computedViewState.min_y < -1000 ? -1000 : computedViewState.min_y,
    ],
    [
      computedViewState.max_x,
      computedViewState.min_y < -1000 ? -1000 : computedViewState.min_y,
    ],
    [
      computedViewState.max_x,
      computedViewState.max_y > 10000 ? 10000 : computedViewState.max_y,
    ],
    [
      computedViewState.min_x,
      computedViewState.max_y > 10000 ? 10000 : computedViewState.max_y,
    ],
  ];

  const bound_contour = [[outer_bounds, inner_bounds]];

  const scatter_layer_common_props = {
    getPosition: (d: Node) => [getX(d), d.y],
    getFillColor: (d: Node) => toRGB(getNodeColorField(d, detailed_data)),
    getRadius: settings.nodeSize,
    // radius in pixels
    // we had to get rid of the below because it was messing up the genotype colours
    // getRadius: (d) =>
    //  getNodeColorField(d, detailed_data) === hoveredKey ? 4 : 3,
    getLineColor: [100, 100, 100],
    opacity: settings.opacity,
    stroked: data.data.nodes && data.data.nodes.length < 3000,
    lineWidthUnits: "pixels",
    lineWidthScale: 1,
    pickable: true,
    radiusUnits: "pixels",
    onHover: (info: HoverInfo<Node>) => setHoverInfo(info),
    modelMatrix: modelMatrix,
    updateTriggers: {
      getFillColor: [detailed_data, getNodeColorField, colorHook],
      getRadius: [settings.nodeSize],
      getPosition: [xType],
    },
  };

  const line_layer_horiz_common_props = {
    getSourcePosition: (d: Node) => [getX(d), d.y],
    getTargetPosition: (d: Node) => [d.parent_x, d.y],
    getColor: lineColor,
    pickable: true,
    widthUnits: "pixels",
    getWidth: (d: Node) =>
      d === (hoverInfo && hoverInfo.object)
        ? 3
        : selectedDetails.nodeDetails &&
            selectedDetails.nodeDetails.node_id === d.node_id
          ? 3.5
          : 1,

    onHover: (info: HoverInfo<Node>) => setHoverInfo(info),

    modelMatrix: modelMatrix,
    updateTriggers: {
      getSourcePosition: [detailed_data, xType],
      getTargetPosition: [detailed_data, xType],
      getWidth: [hoverInfo, selectedDetails.nodeDetails],
    },
  };

  const line_layer_vert_common_props = {
    getSourcePosition: (d: Node) => [d.parent_x, d.y],
    getTargetPosition: (d: Node) => [d.parent_x, d.parent_y],
    onHover: (info: HoverInfo<Node>) => setHoverInfo(info),
    getColor: lineColor,
    pickable: true,
    getWidth: (d: Node) =>
      d === (hoverInfo && hoverInfo.object)
        ? 2
        : selectedDetails.nodeDetails &&
            selectedDetails.nodeDetails.node_id === d.node_id
          ? 2.5
          : 1,
    modelMatrix: modelMatrix,
    updateTriggers: {
      getSourcePosition: [detailed_data, xType],
      getTargetPosition: [detailed_data, xType],
      getWidth: [hoverInfo, selectedDetails.nodeDetails],
    },
  };

  if (detailed_data.nodes) {
    const main_scatter_layer = {
      layerType: "ScatterplotLayer",
      ...scatter_layer_common_props,
      id: "main-scatter",
      data: detailed_scatter_data,
    };

    const pretty_stroke_background_layer = settings.prettyStroke.enabled
      ? {
          ...main_scatter_layer,
          getFillColor: settings.prettyStroke.color,
          getLineWidth: 0,
          getRadius: main_scatter_layer.getRadius + settings.prettyStroke.width,
        }
      : null;

    const fillin_scatter_layer = {
      layerType: "ScatterplotLayer",
      ...scatter_layer_common_props,
      id: "fillin-scatter",
      data: minimap_scatter_data,
      getFillColor: (d: Node) => toRGB(getNodeColorField(d, base_data)),
    };

    const main_line_layer = {
      layerType: "LineLayer",
      ...line_layer_horiz_common_props,
      id: "main-line-horiz",
      data: detailed_data.nodes,
    };

    const main_line_layer2 = {
      layerType: "LineLayer",
      ...line_layer_vert_common_props,
      id: "main-line-vert",
      data: detailed_data.nodes,
    };

    const fillin_line_layer = {
      layerType: "LineLayer",
      ...line_layer_horiz_common_props,
      id: "fillin-line-horiz",
      data: base_data.nodes,
    };

    const fillin_line_layer2 = {
      layerType: "LineLayer",
      ...line_layer_vert_common_props,
      id: "fillin-line-vert",
      data: base_data.nodes,
    };

    const selectedLayer = {
      layerType: "ScatterplotLayer",
      data: selectedDetails.nodeDetails ? [selectedDetails.nodeDetails] : [],
      visible: true,
      opacity: 1,
      getRadius: 6,
      radiusUnits: "pixels",

      id: "main-selected",
      filled: false,
      stroked: true,
      modelMatrix,

      getLineColor: [0, 0, 0],
      getPosition: (d: Node) => {
        return [d[xType], d.y];
      },
      lineWidthUnits: "pixels",
      lineWidthScale: 2,
    };

    const hoveredLayer = {
      layerType: "ScatterplotLayer",
      data: hoverInfo && hoverInfo.object ? [hoverInfo.object] : [],
      visible: true,
      opacity: 0.3,
      getRadius: 4,
      radiusUnits: "pixels",

      id: "main-hovered",
      filled: false,
      stroked: true,
      modelMatrix,

      getLineColor: [0, 0, 0],
      getPosition: (d: Node) => {
        return [d[xType], d.y];
      },
      lineWidthUnits: "pixels",
      lineWidthScale: 2,
    };


    const clade_label_layer = {
      layerType: "TextLayer",
      id: "main-clade-node",
      getPixelOffset: [-5, -6],
      data: clade_data,
      getPosition: (d: Node) => [getX(d), d.y],
      getText: (d: Node) => d.clades[clade_accessor],

      getColor: settings.cladeLabelColor,
      getAngle: 0,
      fontFamily: "Roboto, sans-serif",
      fontWeight: 700,

      billboard: true,
      getTextAnchor: "end",
      getAlignmentBaseline: "center",
      getSize: 11,
      modelMatrix: modelMatrix,
      updateTriggers: {
        getPosition: [getX],
      },
    };

    layers.push(
      main_line_layer,
      main_line_layer2,
      fillin_line_layer,
      fillin_line_layer2,
      pretty_stroke_background_layer,
      main_scatter_layer,
      fillin_scatter_layer,
      clade_label_layer,
      selectedLayer,
      hoveredLayer,
    );
  }

  const tipNodesForMatrix = useMemo(
    () =>
      detailed_scatter_data.filter(
        (node: Node) =>
          node.is_tip || (node.is_tip === undefined && node.num_tips === 1),
      ),
    [detailed_scatter_data]
  );

  const visibleTipNodesForMatrix = useMemo(
    () =>
      tipNodesForMatrix.filter(
        (node: Node) =>
          node.y >= computedViewState.min_y && node.y <= computedViewState.max_y,
      ),
    [computedViewState.max_y, computedViewState.min_y, tipNodesForMatrix]
  );

  const sampledPixelsPerTip =
    deckSize && deckSize.height > 0 && visibleTipNodesForMatrix.length > 0
      ? deckSize.height / visibleTipNodesForMatrix.length
      : Number.POSITIVE_INFINITY;

  const visibleTipMinY = useMemo(
    () =>
      visibleTipNodesForMatrix.length > 0
        ? Math.min(...visibleTipNodesForMatrix.map((node: Node) => node.y))
        : computedViewState.min_y,
    [computedViewState.min_y, visibleTipNodesForMatrix]
  );

  const visibleTipMaxY = useMemo(
    () =>
      visibleTipNodesForMatrix.length > 0
        ? Math.max(...visibleTipNodesForMatrix.map((node: Node) => node.y))
        : computedViewState.max_y,
    [computedViewState.max_y, visibleTipNodesForMatrix]
  );

  const visibleTipSpanY = Math.max(
    pixelToWorldY(1),
    visibleTipMaxY - visibleTipMinY
  );

  const densityMinY = computedViewState.min_y;
  const densityMaxY = computedViewState.max_y;
  const densitySpanY = Math.max(pixelToWorldY(1), densityMaxY - densityMinY);

  const visibleTipCountRequest = useMemo(
    () =>
      backend.type === "local" && backend.queryVisibleTipCount
        ? {
            minY: densityMinY,
            maxY: densityMaxY,
          }
        : null,
    [backend, densityMaxY, densityMinY]
  );

  const visibleTipCountRequestKey = useMemo(
    () => (visibleTipCountRequest ? JSON.stringify(visibleTipCountRequest) : null),
    [visibleTipCountRequest]
  );

  const [resolvedVisibleTipCountData, setResolvedVisibleTipCountData] = useState<{
    key: string;
    data: VisibleTipCountResponse;
  } | null>(null);

  useEffect(() => {
    if (
      !visibleTipCountRequest ||
      !visibleTipCountRequestKey ||
      !backend.queryVisibleTipCount
    ) {
      return;
    }

    let cancelled = false;
    backend.queryVisibleTipCount(visibleTipCountRequest, (result) => {
      if (!cancelled) {
        setResolvedVisibleTipCountData({
          key: visibleTipCountRequestKey,
          data: result,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [backend, visibleTipCountRequest, visibleTipCountRequestKey]);

  const localVisibleTipCount =
    resolvedVisibleTipCountData?.data.visibleTipCount ?? null;
  const localPixelsPerTip =
    deckSize && deckSize.height > 0 && localVisibleTipCount && localVisibleTipCount > 0
      ? deckSize.height / localVisibleTipCount
      : Number.POSITIVE_INFINITY;

  const [localMetadataRenderMode, setLocalMetadataRenderMode] =
    useState<MetadataMatrixRenderMode>("density");

  useEffect(() => {
    if (backend.type !== "local" || !Number.isFinite(localPixelsPerTip)) {
      return;
    }
    setLocalMetadataRenderMode((previousMode) =>
      getNextLocalMetadataRenderMode(localPixelsPerTip, previousMode)
    );
  }, [backend.type, localPixelsPerTip]);

  const metadataRenderMode: MetadataMatrixRenderMode = useMemo(() => {
    if (backend.type === "local") {
      return localMetadataRenderMode;
    }
    if (sampledPixelsPerTip >= 16) {
      return "boxes";
    }
    if (sampledPixelsPerTip >= 8) {
      return "rectangles";
    }
    if (sampledPixelsPerTip >= 3) {
      return "strips";
    }
    return "density";
  }, [backend.type, localMetadataRenderMode, sampledPixelsPerTip]);

  const pixelsPerTip =
    backend.type === "local" ? localPixelsPerTip : sampledPixelsPerTip;

  const metadataDebugInfo = metadataMatrix.isEnabled
    ? {
        pixelsPerTip,
        renderMode: metadataRenderMode,
      }
    : null;

  const metadataDensityRequest = useMemo(() => {
    if (
      !metadataMatrix.isEnabled ||
      metadataRenderMode !== "density" ||
      backend.type !== "local" ||
      !backend.queryMetadataDensity ||
      metadataMatrix.matrixFields.length === 0 ||
      !localVisibleTipCount
    ) {
      return null;
    }

    return {
      minY: densityMinY,
      maxY: densityMaxY,
      height: Math.max(
        1,
        Math.ceil(Math.max(1, Math.round(deckSize?.height ?? 1)) / 2)
      ),
      fields: metadataMatrix.matrixFields.map((field) => field.field),
    };
  }, [
    backend,
    deckSize?.height,
    metadataMatrix.isEnabled,
    metadataMatrix.matrixFields,
    metadataRenderMode,
    densityMinY,
    densityMaxY,
    localVisibleTipCount,
  ]);

  const metadataDensityRequestKey = useMemo(
    () => (metadataDensityRequest ? JSON.stringify(metadataDensityRequest) : null),
    [metadataDensityRequest]
  );

  const [metadataDensityData, setMetadataDensityData] = useState<{
    key: string;
    data: MetadataDensityResponse;
  } | null>(null);
  const [resolvedMetadataDensityData, setResolvedMetadataDensityData] = useState<{
    key: string;
    data: MetadataDensityResponse;
    spanY: number;
  } | null>(null);

  useEffect(() => {
    if (
      !metadataDensityRequest ||
      !metadataDensityRequestKey ||
      !backend.queryMetadataDensity
    ) {
      return;
    }

    let cancelled = false;
    backend.queryMetadataDensity(metadataDensityRequest, (result) => {
      if (!cancelled) {
        const resolved = {
          key: metadataDensityRequestKey,
          data: result,
          spanY: densitySpanY,
        };
        setMetadataDensityData(resolved);
        setResolvedMetadataDensityData(resolved);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [backend, metadataDensityRequest, metadataDensityRequestKey]);

  if (metadataMatrix.isEnabled && visibleTipNodesForMatrix.length > 0) {
    const sortedVisibleTipNodesForMatrix = [...visibleTipNodesForMatrix].sort(
      (a: Node, b: Node) => a.y - b.y
    );
    const matrixCells: MetadataMatrixCell[] = visibleTipNodesForMatrix.flatMap(
      (node: Node) =>
        metadataMatrix.matrixFields.map((field, index) => ({
          node,
          field: field.field,
          x:
            12 + index * metadataMatrix.columnWidth + metadataMatrix.columnWidth / 2,
          y: node.y,
          isTrue: metadataMatrix.isTruthyValue(node[field.field]),
          color: field.color,
        }))
    );

    if (metadataRenderMode === "boxes" || metadataRenderMode === "rectangles") {
      const isLocalRectangleMode =
        backend.type === "local" && metadataRenderMode === "rectangles";
      const isLocalBoxRectangleMode =
        backend.type === "local" &&
        (metadataRenderMode === "boxes" || metadataRenderMode === "rectangles");
      const heightPixels =
        metadataRenderMode === "boxes"
          ? Math.min(metadataMatrix.cellSize, Math.max(6, pixelsPerTip - 1))
          : isLocalRectangleMode
            ? Math.min(20, Math.max(6, pixelsPerTip * 1.15))
            : Math.min(18, Math.max(3, pixelsPerTip));
      const halfHeight = pixelToWorldY(heightPixels) / 2;
      const boxRectangleTransitionProgress = isLocalBoxRectangleMode
        ? getBoxRectangleTransitionProgress(pixelsPerTip)
        : metadataRenderMode === "boxes"
          ? 1
          : 0;
      const rectangleHalfWidth = Math.max(
        metadataMatrix.columnWidth / 2 - 1,
        metadataMatrix.cellSize / 2
      );
      const boxHalfWidth = metadataMatrix.cellSize / 2;
      const halfWidth =
        isLocalBoxRectangleMode
          ? rectangleHalfWidth +
            (boxHalfWidth - rectangleHalfWidth) *
              boxRectangleTransitionProgress
          : metadataRenderMode === "boxes"
            ? boxHalfWidth
          : isLocalRectangleMode
            ? rectangleHalfWidth
            : Math.max(metadataMatrix.cellSize / 2, metadataMatrix.columnWidth / 2 - 3);
      if (metadataRenderMode === "boxes" || isLocalRectangleMode) {
        layers.push({
          layerType: "PolygonLayer",
          id: "metadata-matrix-boxes-background",
          data: metadataMatrix.matrixFields.map((field, index) => ({
            field: field.field,
            x:
              12 +
              index * metadataMatrix.columnWidth +
              metadataMatrix.columnWidth / 2,
          })),
          pickable: false,
          stroked: false,
          filled: true,
          getPolygon: (d: { x: number }) => [
            [d.x - (metadataMatrix.columnWidth / 2 - 1), densityMinY],
            [d.x + (metadataMatrix.columnWidth / 2 - 1), densityMinY],
            [d.x + (metadataMatrix.columnWidth / 2 - 1), densityMinY + densitySpanY],
            [d.x - (metadataMatrix.columnWidth / 2 - 1), densityMinY + densitySpanY],
          ],
          getFillColor: METADATA_BACKGROUND_RGBA,
          updateTriggers: {
            getPolygon: [
              metadataMatrix.columnWidth,
              densityMinY,
              densitySpanY,
            ],
          },
        });
      }
      layers.push({
        layerType: "PolygonLayer",
        id: `metadata-matrix-${metadataRenderMode}`,
        data: matrixCells,
        pickable: false,
        stroked:
          metadataRenderMode === "boxes" ||
          (isLocalRectangleMode && boxRectangleTransitionProgress > 0),
        filled: true,
        lineWidthUnits: "pixels",
        getLineWidth:
          metadataRenderMode === "boxes"
            ? Math.max(0.5, boxRectangleTransitionProgress)
            : isLocalRectangleMode
              ? boxRectangleTransitionProgress
              : 1,
        getPolygon: (d: MetadataMatrixCell) => [
          [d.x - halfWidth, d.y - halfHeight],
          [d.x + halfWidth, d.y - halfHeight],
          [d.x + halfWidth, d.y + halfHeight],
          [d.x - halfWidth, d.y + halfHeight],
        ],
        getFillColor: (d: MetadataMatrixCell) =>
          d.isTrue
            ? [...d.color, 255]
            : metadataRenderMode === "boxes"
              ? [255, 255, 255, 235]
              : METADATA_BACKGROUND_RGBA,
        getLineColor: (d: MetadataMatrixCell) =>
          isLocalBoxRectangleMode
            ? blendRgbTowardBackground(
                d.color,
                boxRectangleTransitionProgress,
                METADATA_BACKGROUND_RGBA
              )
            : d.color,
        updateTriggers: {
          getPolygon: [
            metadataRenderMode,
            isLocalRectangleMode,
            boxRectangleTransitionProgress,
            metadataMatrix.cellSize,
            metadataMatrix.columnWidth,
            heightPixels,
            zoomY,
          ],
          getFillColor: [metadataMatrix.matrixFields],
          getLineColor: [
            metadataMatrix.matrixFields,
            boxRectangleTransitionProgress,
          ],
          getLineWidth: [metadataRenderMode, boxRectangleTransitionProgress],
        },
      });
    } else if (metadataRenderMode === "strips") {
      const stripHeightPixels = clamp(pixelsPerTip * 1.25, 1, 4);
      const halfHeight = pixelToWorldY(stripHeightPixels) / 2;
      const halfWidth = Math.max(
        metadataMatrix.columnWidth / 2 - 2,
        metadataMatrix.cellSize / 2
      );
      layers.push({
        layerType: "PolygonLayer",
        id: "metadata-matrix-strips",
        data: matrixCells,
        pickable: false,
        stroked: false,
        filled: true,
        getPolygon: (d: MetadataMatrixCell) => [
          [d.x - halfWidth, d.y - halfHeight],
          [d.x + halfWidth, d.y - halfHeight],
          [d.x + halfWidth, d.y + halfHeight],
          [d.x - halfWidth, d.y + halfHeight],
        ],
        getFillColor: (d: MetadataMatrixCell) =>
          d.isTrue ? [...d.color, 245] : METADATA_BACKGROUND_RGBA,
        updateTriggers: {
          getPolygon: [
            metadataMatrix.columnWidth,
            metadataMatrix.cellSize,
            stripHeightPixels,
            zoomY,
          ],
          getFillColor: [metadataMatrix.matrixFields],
        },
      });
    } else {
      const densityPayload =
        backend.type === "local"
          ? resolvedMetadataDensityData?.data ?? null
          : metadataDensityData &&
              metadataDensityRequestKey &&
              metadataDensityData.key === metadataDensityRequestKey &&
              metadataDensityData.data.minY === densityMinY &&
              metadataDensityData.data.maxY === densityMaxY
            ? metadataDensityData.data
            : null;

      const densityCanvas = createMetadataDensityCanvas({
        width: Math.max(1, Math.round(metadataMatrix.panelWidth)),
        height: Math.max(1, Math.round(deckSize?.height ?? 1)),
        columnWidth: metadataMatrix.columnWidth,
        matrixFields: metadataMatrix.matrixFields,
        tipNodes:
          backend.type === "server" ? sortedVisibleTipNodesForMatrix : undefined,
        densityData: densityPayload,
        allowTipNodeFallback: backend.type === "server",
        minY: densityMinY,
        maxY: densityMaxY,
        isTruthyValue: metadataMatrix.isTruthyValue,
      });

      layers.push({
        layerType: "BitmapLayer",
        id: "metadata-matrix-density",
        image: densityCanvas,
        pickable: false,
        bounds: [
          0,
          densityMinY,
          metadataMatrix.panelWidth,
          densityMinY + densitySpanY,
        ],
        desaturate: 0,
        transparentColor: [0, 0, 0, 0],
        updateTriggers: {
          image: [
            metadataMatrix.panelWidth,
            metadataMatrix.columnWidth,
            deckSize?.height,
            densityMinY,
            densitySpanY,
            metadataMatrix.matrixFields,
            visibleTipNodesForMatrix.length,
            metadataDensityRequestKey,
          ],
        },
      });
    }
  }

  const proportionalToNodesOnScreen =
    (config as any).num_tips / 2 ** zoomY;

  // If leaves are fewer than max_text_number, add a text layer
  if (
    data.data.nodes &&
    proportionalToNodesOnScreen <
      0.8 * 10 ** settings.thresholdForDisplayingText
  ) {
    const node_label_layer = {
      layerType: "TextLayer",
      id: "main-text-node",
      fontFamily: "Roboto, sans-serif",
      fontWeight: 100,
      data: data.data.nodes.filter((node: Node) =>
        settings.displayTextForInternalNodes
          ? true
          : node.is_tip || (node.is_tip === undefined && node.num_tips === 1),
      ),
      getPosition: (d: Node) => [getX(d), d.y],
      getText: (d: Node) => d[(config as any).name_accessor],

      getColor: settings.terminalNodeLabelColor,
      getAngle: 0,

      billboard: true,
      getTextAnchor: "start",
      getAlignmentBaseline: "center",
      getSize: data.data.nodes.length < 200 ? 12 : 9.5,
      modelMatrix: modelMatrix,
      getPixelOffset: [10, 0],
    };

    layers.push(node_label_layer);
  }

  const minimap_scatter = {
    layerType: "ScatterplotLayer",
    id: "minimap-scatter",
    data: minimap_scatter_data,
    getPolygonOffset: ({ layerIndex }: { layerIndex: number }) => [0, -4000],
    getPosition: (d: Node) => [getX(d), d.y],
    getFillColor: (d: Node) => toRGB(getNodeColorField(d, base_data)),
    // radius in pixels
    getRadius: 2,
    getLineColor: [100, 100, 100],

    opacity: 0.6,
    radiusUnits: "pixels",
    onHover: (info: HoverInfo<Node>) => setHoverInfo(info),
    updateTriggers: {
      getFillColor: [base_data, getNodeColorField, colorHook],
      getPosition: [minimap_scatter_data, xType],
    },
  };

  const minimap_line_horiz = {
    layerType: "LineLayer",
    id: "minimap-line-horiz",
    getPolygonOffset: ({ layerIndex }: { layerIndex: number }) => [0, -4000],
    data: base_data.nodes,
    getSourcePosition: (d: Node) => [getX(d), d.y],
    getTargetPosition: (d: Node) => [d.parent_x, d.y],
    getColor: lineColor,
    updateTriggers: {
      getSourcePosition: [base_data, xType],
      getTargetPosition: [base_data, xType],
    },
  };

  const minimap_line_vert = {
    layerType: "LineLayer",
    id: "minimap-line-vert",
    getPolygonOffset: ({ layerIndex }: { layerIndex: number }) => [0, -4000],
    data: base_data.nodes,
    getSourcePosition: (d: Node) => [d.parent_x, d.y],
    getTargetPosition: (d: Node) => [d.parent_x, d.parent_y],
    getColor: lineColor,

    updateTriggers: {
      getSourcePosition: [base_data, xType],
      getTargetPosition: [base_data, xType],
    },
  };

  const minimap_polygon_background = {
    layerType: "PolygonLayer",
    id: "minimap-bound-background",
    data: [outer_bounds],
    getPolygon: (d: any) => d,
    pickable: true,
    stroked: true,
    opacity: 0.3,
    filled: true,
    getPolygonOffset: ({ layerIndex }: { layerIndex: number }) => [0, -2000],

    getFillColor: (d: any) => [255, 255, 255],
  };

  const minimap_bound_polygon = {
    layerType: "PolygonLayer",
    id: "minimap-bound-line",
    data: bound_contour,
    getPolygon: (d: any) => d,
    pickable: true,
    stroked: true,
    opacity: 0.3,
    filled: true,
    wireframe: true,
    getFillColor: (d: any) => [240, 240, 240],
    getLineColor: [80, 80, 80],
    getLineWidth: 1,
    lineWidthUnits: "pixels",
    getPolygonOffset: ({ layerIndex }: { layerIndex: number }) => [0, -6000],
  };

  const { searchSpec, searchResults, searchesEnabled } = search;

  const search_layers = searchSpec.map((spec: any, i: number) => {
    const data = searchResults[spec.key]
      ? searchResults[spec.key].result.data
      : [];

    const lineColor = search.getLineColor(i);

    return {
      layerType: "ScatterplotLayer",

      data: data,
      id: "main-search-scatter-" + spec.key,
      getPosition: (d: Node) => [d[xType], d.y],
      getLineColor: settings.displaySearchesAsPoints ? [0, 0, 0] : lineColor,
      getRadius: settings.displaySearchesAsPoints
        ? settings.searchPointSize
        : 5 + 2 * i,
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      stroked: true,
      visible: searchesEnabled[spec.key],
      wireframe: true,
      getLineWidth: 1,
      filled: true,
      getFillColor: settings.displaySearchesAsPoints
        ? lineColor
        : [255, 0, 0, 0],
      modelMatrix: modelMatrix,
      updateTriggers: {
        getPosition: [xType],
      },
    };
  });

  const search_mini_layers = searchSpec.map((spec: any, i: number) => {
    const data = searchResults[spec.key]
      ? searchResults[spec.key].overview
      : [];
    const lineColor = search.getLineColor(i);

    return {
      layerType: "ScatterplotLayer",
      data: data,
      getPolygonOffset: ({ layerIndex }: { layerIndex: number }) => [0, -9000],
      id: "mini-search-scatter-" + spec.key,
      visible: searchesEnabled[spec.key],
      getPosition: (d: Node) => [d[xType], d.y],
      getLineColor: lineColor,
      getRadius: 5 + 2 * i,
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      stroked: true,

      wireframe: true,
      getLineWidth: 1,
      filled: false,
      getFillColor: [255, 0, 0, 0],
      updateTriggers: { getPosition: [xType] },
    };
  });
  layers.push(...search_layers, ...search_mini_layers);

  layers.push(minimap_polygon_background);
  layers.push(minimap_line_horiz, minimap_line_vert, minimap_scatter);
  layers.push(minimap_bound_polygon);

  const layerFilter = useCallback(
    ({
      layer,
      viewport,
      renderPass,
    }: {
      layer: any;
      viewport: any;
      renderPass: any;
    }) => {
      const first_bit =
        (layer.id.startsWith("main") && viewport.id === "main") ||
        (layer.id.startsWith("mini") && viewport.id === "minimap") ||
        (layer.id.startsWith("fillin") &&
          viewport.id === "main" &&
          isCurrentlyOutsideBounds) ||
        (layer.id.startsWith("metadata") && viewport.id === "metadata-matrix") ||
        (layer.id.startsWith("browser-loaded") &&
          viewport.id === "browser-main") ||
        (layer.id.startsWith("browser-fillin") &&
          viewport.id === "browser-main" &&
          isCurrentlyOutsideBounds);

      return first_bit;
    },
    [isCurrentlyOutsideBounds],
  );

  const processedLayers = layers
    .filter((x) => x !== null)
    .map((layer) => {
        if (layer.layerType === "ScatterplotLayer") {
          return new ScatterplotLayer(layer as any);
        }
        if (layer.layerType === "LineLayer") {
          return new LineLayer(layer as any);
        }
        if (layer.layerType === "PolygonLayer") {
          return new PolygonLayer(layer as any);
        }
        if (layer.layerType === "TextLayer") {
          return new TextLayer(layer as any);
        }
        if (layer.layerType === "SolidPolygonLayer") {
          return new SolidPolygonLayer(layer as any);
        }
        if (layer.layerType === "BitmapLayer") {
          return new BitmapLayer(layer as any);
        }
      console.log("could not map layer spec for ", layer);
    });

  const { triggerSVGdownload } = getSVGfunction(
    layers.filter((x) => x !== null),
    viewState,
  );

  return {
    layers: processedLayers,
    layerFilter,
    keyStuff,
    triggerSVGdownload,
    metadataDebugInfo,
  };
};

export default useLayers;
