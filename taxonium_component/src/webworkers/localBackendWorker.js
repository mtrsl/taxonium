import { buildGeographicIndex, queryGeography } from "../utils/geography";
import { aggregateColor } from "../utils/metadataAggregate";
import { buildMetadataTableIndex, queryMetadataTablePage } from "../utils/metadataTable";
import { buildCategoryIndex, categoryRangeMode } from "../utils/categoricalDensity";
import { summarizeMetadata, createMetadataColor, numericMetadataValue } from "../utils/metadata";
import filtering from "taxonium_data_handling/filtering.js";
import { getNextstrainSubtreeJson } from "taxonium_data_handling/exporting.js";
import {
  processJsonl,
  generateConfig,
} from "taxonium_data_handling/importing.js";
import { processNewickAndMetadata } from "../utils/processNewick";
import { processNextstrain } from "../utils/processNextstrain.js";
import { ReadableWebToNodeStream } from "readable-web-to-node-stream";
import { parser } from "stream-json";
import { streamValues } from "stream-json/streamers/StreamValues";
import { Buffer } from "buffer";
import {
  normalizeMetadataValue,
  TRUE_VALUES,
} from "../utils/metadataMatrix";

postMessage({ data: "Worker starting" });

const the_cache = {};

const cache_helper = {
  retrieve_from_cache: (key) => the_cache[key],
  store_in_cache: (key, value) => {
    the_cache[key] = value;

    // Total size of the lists in the cache
    let total_size = 0;
    for (const key in the_cache) {
      total_size += the_cache[key].length;
    }

    // If the cache is too big, remove a random item
    if (total_size > 100e6) {
      const keys = Object.keys(the_cache);
      const random_key = keys[Math.floor(Math.random() * keys.length)];
      delete the_cache[random_key];
    }
  },
};

let processedUploadedData;
let uploadGeneration = 0;
let pendingGeography = null;
let activeGeography = null;
let pendingDensity = null;
let activeDensity = null;
const DENSITY_CANCELLED = Symbol("density cancelled");
const yieldToMessages = () => new Promise(resolve => setTimeout(resolve, 0));

const sendStatusMessage = (status_obj) => {
  postMessage({
    type: "status",
    data: status_obj,
  });
};

const waitForProcessedData = async () => {
  // check if processedUploadedData is defined, if not wait until it is
  if (processedUploadedData === undefined) {
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (processedUploadedData !== undefined) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }
};

const findFirstIndexAtOrAbove = (values, target) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

const getNodesInYRange = (nodes, y_positions, minY, maxY) => {
  if (!Array.isArray(nodes) || !Array.isArray(y_positions) || minY > maxY) {
    return [];
  }

  const startIndex = findFirstIndexAtOrAbove(y_positions, minY);
  const endExclusive = findFirstIndexAtOrAbove(y_positions, maxY + Number.EPSILON);
  return nodes.slice(startIndex, endExclusive);
};

const isTruthyMetadataValue = (value) =>
  TRUE_VALUES.has(normalizeMetadataValue(value));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const createMetadataDensityIndex = (nodes) => {
  const tipNodes = nodes.filter((node) => node.is_tip || (node.is_tip === undefined && node.num_tips === 1));
  const fieldNames = new Set();
  tipNodes.forEach((node) => {
    Object.keys(node).forEach((field) => {
      if (field.startsWith("meta_")) {
        fieldNames.add(field);
      }
    });
  });
  const fieldInfo = {};
  fieldNames.forEach((field) => {
    function* values() { for (const node of tipNodes) yield node[field]; }
    fieldInfo[field] = summarizeMetadata(values());
  });
  return {
    tipNodes,
    tipYPositions: tipNodes.map((node) => node.y),
    fieldPrefixTrueCounts: {},
    fieldPrefixNumericValues: {},
    fieldInfo,
    categoryIndexes: new Map(),
    summaries: new Map(),
  };
};

const ensureFieldTruePrefixCounts = async (index, field, checkpoint) => {
  if (!index.fieldPrefixTrueCounts[field]) {
    const counts = new Uint32Array(index.tipNodes.length + 1);
    for (let i = 0; i < index.tipNodes.length; i++) {
      if (i % 65536 === 0) await checkpoint();
      counts[i + 1] = counts[i] + (isTruthyMetadataValue(index.tipNodes[i][field]) ? 1 : 0);
    }
    index.fieldPrefixTrueCounts[field] = counts;
  }
  return index.fieldPrefixTrueCounts[field];
};

const ensureFieldNumericPrefixValues = async (index, field, checkpoint) => {
  if (!index.fieldPrefixNumericValues[field]) {
    const sums = new Float64Array(index.tipNodes.length + 1);
    const counts = new Uint32Array(index.tipNodes.length + 1);
    for (let i = 0; i < index.tipNodes.length; i++) {
      if (i % 65536 === 0) await checkpoint();
      const value = numericMetadataValue(index.tipNodes[i][field]);
      sums[i + 1] = sums[i] + (value ?? 0);
      counts[i + 1] = counts[i] + (value === null ? 0 : 1);
    }
    index.fieldPrefixNumericValues[field] = { sums, counts };
  }
  return index.fieldPrefixNumericValues[field];
};

export const queryNodes = async (boundsForQueries) => {
  boundsForQueries = boundsForQueries ?? {};
  await waitForProcessedData();

  const {
    nodes,
    overallMaxX,
    overallMaxY,
    overallMinX,
    overallMinY,
    y_positions,
  } = processedUploadedData;

  let min_y = isNaN(boundsForQueries.min_y)
    ? overallMinY
    : boundsForQueries.min_y;
  let max_y = isNaN(boundsForQueries.max_y)
    ? overallMaxY
    : boundsForQueries.max_y;

  let min_x = isNaN(boundsForQueries.min_x)
    ? overallMinX
    : boundsForQueries.min_x;
  let max_x = isNaN(boundsForQueries.max_x)
    ? overallMaxX
    : boundsForQueries.max_x;
  if (min_y < overallMinY) {
    min_y = overallMinY;
  }
  if (max_y > overallMaxY) {
    max_y = overallMaxY;
  }
  let result;

  result = {
    nodes: filtering.getNodes(
      nodes,
      y_positions,
      min_y,
      max_y,
      min_x,
      max_x,
      boundsForQueries.xType
    ),
  };


  return result;
};

const search = async (search, bounds) => {
  await waitForProcessedData();

  const {
    nodes,
    overallMaxX,
    overallMaxY,
    overallMinX,
    overallMinY,
    y_positions,
    node_to_mut,
    mutations,
  } = processedUploadedData;
  const spec = JSON.parse(search);

  const min_y = bounds && bounds.min_y ? bounds.min_y : overallMinY;
  const max_y = bounds && bounds.max_y ? bounds.max_y : overallMaxY;
  const min_x = bounds && bounds.min_x ? bounds.min_x : overallMinX;
  const max_x = bounds && bounds.max_x ? bounds.max_x : overallMaxX;
  const xType = bounds && bounds.xType ? bounds.xType : "x_dist";

  const result = filtering.singleSearch({
    data: nodes,
    spec,
    min_y,
    max_y,
    min_x,
    max_x,
    y_positions,
    mutations,
    node_to_mut,
    xType: xType,
    cache_helper,
  });

  result.key = spec.key;
  return result;
};

const getConfig = async () => {
  await waitForProcessedData();
  const config = {};
  generateConfig(config, processedUploadedData);

  config.mutations = processedUploadedData.mutations;


  const merged_config = {
    ...config,
    metadataFields: {},
    ...processedUploadedData.overwrite_config,
    metadataSummaries: processedUploadedData.metadataDensityIndex?.fieldInfo ?? {},
  };


  return merged_config;
};

const getDetails = async (node_id) => {
  await waitForProcessedData();
  const { nodes } = processedUploadedData;
  const node = nodes[node_id];
  const details = { ...node };
  details.mutations = processedUploadedData.node_to_mut[node_id]
    ? processedUploadedData.node_to_mut[node_id].map(
        (x) => processedUploadedData.mutations[x]
      )
    : [];
  return details;
};

const getList = async (node_id, att) => {
  await waitForProcessedData();
  const { nodes } = processedUploadedData;
  const atts = filtering.getTipAtts(nodes, node_id, att);
  return atts;
};

const getMetadataDensity = async ({
  minY,
  maxY,
  height,
  width,
  outputHeight,
  columnWidth,
  fields,
}, checkpoint = async () => {}) => {
  await waitForProcessedData();
  if (!processedUploadedData.metadataDensityIndex) {
    processedUploadedData.metadataDensityIndex = createMetadataDensityIndex(
      processedUploadedData.nodes
    );
  }
  const { metadataDensityIndex } = processedUploadedData;
  const { tipYPositions } = metadataDensityIndex;

  const result = {
    fields: {},
    minY,
    maxY,
    height,
  };

  if (
    tipYPositions.length === 0 ||
    maxY <= minY ||
    height <= 0 ||
    width <= 0 ||
    outputHeight <= 0
  ) {
    return result;
  }

  const rowLowerBounds = new Uint32Array(height);
  const rowUpperBounds = new Uint32Array(height);
  for (let rowIndex = 0; rowIndex < height; rowIndex++) {
    const rowUpperY = maxY - (rowIndex * (maxY - minY)) / height;
    const rowLowerY = maxY - ((rowIndex + 1) * (maxY - minY)) / height;
    const startTipIndex = Math.max(
      0,
      Math.min(
        tipYPositions.length,
        findFirstIndexAtOrAbove(tipYPositions, rowLowerY)
      )
    );
    const endTipExclusive = Math.max(
      startTipIndex,
      Math.min(
        tipYPositions.length,
        findFirstIndexAtOrAbove(tipYPositions, rowUpperY)
      )
    );
    rowLowerBounds[rowIndex] = startTipIndex;
    rowUpperBounds[rowIndex] = endTipExclusive;
  }

  // Retain only active columns. Summary caches contain viewport-sized arrays, never tips.
  const selected = new Set(fields.map(({ field }) => field));
  for (const field of metadataDensityIndex.categoryIndexes.keys()) {
    if (!selected.has(field)) metadataDensityIndex.categoryIndexes.delete(field);
  }
  for (const cache of [metadataDensityIndex.fieldPrefixTrueCounts, metadataDensityIndex.fieldPrefixNumericValues]) {
    for (const field of Object.keys(cache)) if (!selected.has(field)) delete cache[field];
  }
  const fieldResults = {};
  for (const { field, kind: requestedKind } of fields) {
    await checkpoint();
    const fieldInfo = metadataDensityIndex.fieldInfo[field];
    const kind = requestedKind ?? fieldInfo?.kind ?? "boolean";
    const cacheKey = JSON.stringify([field, kind, minY, maxY, height]);
    const cached = metadataDensityIndex.summaries.get(cacheKey);
    if (cached) {
      metadataDensityIndex.summaries.delete(cacheKey);
      metadataDensityIndex.summaries.set(cacheKey, cached);
      fieldResults[field] = cached;
      continue;
    }
    let categoryIndex;
    if (kind === "categorical") {
      categoryIndex = metadataDensityIndex.categoryIndexes.get(field);
      if (!categoryIndex) {
        categoryIndex = await buildCategoryIndex(metadataDensityIndex.tipNodes.length,
          i => metadataDensityIndex.tipNodes[i][field], checkpoint);
        metadataDensityIndex.categoryIndexes.set(field, categoryIndex);
        // Bound encoded arrays and dictionary storage to approximately 128 MiB.
        let bytes = 0;
        for (const [key, index] of [...metadataDensityIndex.categoryIndexes].reverse()) {
          bytes += index.codes.byteLength + index.counts.byteLength + index.touched.byteLength
            + index.labels.reduce((sum, label) => sum + label.length * 2 + 16, 0);
          if (bytes > 128 * 1024 * 1024) metadataDensityIndex.categoryIndexes.delete(key);
        }
      }
    }
    const categoryValues = kind === "categorical" ? new Array(height).fill(null) : undefined;
    const trueCounts = kind === "boolean" ? new Uint32Array(height) : undefined;
    const totalCounts = new Uint32Array(height);
    const valueSums = kind === "numeric" ? new Float64Array(height) : undefined;
    const valueCounts = kind === "numeric" ? new Uint32Array(height) : undefined;

    const prefixTrueCounts =
      kind === "boolean"
        ? await ensureFieldTruePrefixCounts(metadataDensityIndex, field, checkpoint)
        : null;
    const prefixNumericValues =
      kind === "numeric"
        ? await ensureFieldNumericPrefixValues(metadataDensityIndex, field, checkpoint)
        : null;

    for (let rowIndex = 0; rowIndex < height; rowIndex++) {
      if (rowIndex % 16 === 0) await checkpoint();
      const startTipIndex = rowLowerBounds[rowIndex];
      const endTipExclusive = rowUpperBounds[rowIndex];
      if (categoryValues) {
        categoryValues[rowIndex] = categoryRangeMode(categoryIndex, startTipIndex, endTipExclusive);
        totalCounts[rowIndex] = endTipExclusive - startTipIndex;
      } else if (kind === "numeric" && prefixNumericValues) {
        valueSums[rowIndex] =
          prefixNumericValues.sums[endTipExclusive] -
          prefixNumericValues.sums[startTipIndex];
        valueCounts[rowIndex] =
          prefixNumericValues.counts[endTipExclusive] -
          prefixNumericValues.counts[startTipIndex];
        totalCounts[rowIndex] = endTipExclusive - startTipIndex;
      } else if (prefixTrueCounts && trueCounts) {
        totalCounts[rowIndex] = endTipExclusive - startTipIndex;
        trueCounts[rowIndex] =
          prefixTrueCounts[endTipExclusive] - prefixTrueCounts[startTipIndex];
      }
    }

    fieldResults[field] = {
      kind,
      trueCounts,
      totalCounts,
      valueSums,
      valueCounts,
      categoryValues,
    };
    metadataDensityIndex.summaries.set(cacheKey, fieldResults[field]);
    while (metadataDensityIndex.summaries.size > 32) {
      metadataDensityIndex.summaries.delete(metadataDensityIndex.summaries.keys().next().value);
    }
  }

  await checkpoint();
  const rgba = new Uint8ClampedArray(width * outputHeight * 4);
  const fieldPixelSpans = fields.map((fieldConfig, fieldIndex) => ({
    field: fieldConfig.field,
    color: fieldConfig.color,
    xStart: Math.max(0, Math.floor(12 + fieldIndex * columnWidth + 1)),
    xEnd: Math.min(width, Math.ceil(12 + (fieldIndex + 1) * columnWidth - 1)),
  }));

  fieldPixelSpans.forEach(({ field, color, xStart, xEnd }, fieldIndex) => {
    if (xEnd <= xStart) {
      return;
    }
    const fieldResult = fieldResults[field];
    const { trueCounts, totalCounts, valueSums, valueCounts, categoryValues } = fieldResult;
    const fieldConfig = fields[fieldIndex];
    const fieldInfo = metadataDensityIndex.fieldInfo[field];
    const kind = fieldConfig.kind ?? fieldInfo?.kind ?? "boolean";
    const valueColor = fieldConfig.colorSpec ? createMetadataColor(fieldConfig.colorSpec) : null;
    const sourceHeight = Math.min(
      kind === "categorical" ? categoryValues.length : kind === "numeric" ? valueSums.length : trueCounts.length,
      totalCounts.length
    );

    for (let rowIndex = 0; rowIndex < outputHeight; rowIndex++) {
      const sourceRow =
        sourceHeight > 0
          ? clamp(
              Math.floor((rowIndex * sourceHeight) / Math.max(1, outputHeight)),
              0,
              sourceHeight - 1
            )
          : 0;
      const fillColor = aggregateColor(fieldResult, sourceRow, color, valueColor);

      for (let x = xStart; x < xEnd; x++) {
        const pixelOffset = (rowIndex * width + x) * 4;
        rgba[pixelOffset] = fillColor[0];
        rgba[pixelOffset + 1] = fillColor[1];
        rgba[pixelOffset + 2] = fillColor[2];
        rgba[pixelOffset + 3] = fillColor[3];
      }
    }
  });

  result.fields = fieldResults;
  result.bitmap = {
    rgba,
    width,
    height: outputHeight,
  };

  return result;
};

const getVisibleTipCount = async ({ minY, maxY }) => {
  await waitForProcessedData();
  if (!processedUploadedData.metadataDensityIndex) {
    processedUploadedData.metadataDensityIndex = createMetadataDensityIndex(
      processedUploadedData.nodes
    );
  }
  const { tipYPositions } = processedUploadedData.metadataDensityIndex;
  const startTipIndex = Math.max(
    0,
    Math.min(tipYPositions.length, findFirstIndexAtOrAbove(tipYPositions, minY))
  );
  const endTipExclusive = Math.max(
    startTipIndex,
    Math.min(
      tipYPositions.length,
      findFirstIndexAtOrAbove(tipYPositions, maxY + Number.EPSILON)
    )
  );

  return {
    minY,
    maxY,
    visibleTipCount: endTipExclusive - startTipIndex,
  };
};

onmessage = async (event) => {
  //Process uploaded data:
  const { data } = event;
  if (data.type === "upload" && data.data?.filename) {
    processedUploadedData = undefined;
    uploadGeneration++;
  }
  const generation = uploadGeneration;
  if (
    data.type === "upload" &&
    data.data &&
    data.data.filename &&
    data.data.filename.includes("jsonl")
  ) {
    const uploaded = await processJsonl(
      data.data,
      sendStatusMessage,
      ReadableWebToNodeStream,
      parser,
      streamValues,
      Buffer
    );
    if (generation !== uploadGeneration) return;
    processedUploadedData = uploaded;
    processedUploadedData.metadataDensityIndex = createMetadataDensityIndex(
      processedUploadedData.nodes
    );

  } else if (
    data.type === "upload" &&
    data.data &&
    data.data.filename &&
    (data.data.filetype === "nwk" || data.data.filetype === "nexus")
  ) {
    data.data.useDistances = true;
    const uploaded = await processNewickAndMetadata(
      data.data,
      sendStatusMessage
    );
    if (generation !== uploadGeneration) return;
    processedUploadedData = uploaded;
    processedUploadedData.metadataDensityIndex = createMetadataDensityIndex(
      processedUploadedData.nodes
    );
  } else if (
    data.type === "upload" &&
    data.data &&
    data.data.filename &&
    data.data.filetype === "nextstrain"
  ) {
    const uploaded = await processNextstrain(
      data.data,
      sendStatusMessage
    );
    if (generation !== uploadGeneration) return;
    processedUploadedData = uploaded;
    processedUploadedData.metadataDensityIndex = createMetadataDensityIndex(
      processedUploadedData.nodes
    );
  } else if (data.type === "upload" && data.data && data.data.filename) {
    sendStatusMessage({
      error:
        "Only Taxonium jsonl files are supported (could not find 'jsonl' in filename)",
    });
  } else {
    if (data.type === "query") {
      const result = await queryNodes(data.bounds);
      postMessage({ type: "query", data: result });
    }
    if (data.type === "search") {
      const result = await search(data.search, data.bounds);
      postMessage({ type: "search", data: result });
    }
    if (data.type === "config") {
      const result = await getConfig();
      postMessage({ type: "config", data: result });
    }
    if (data.type === "details") {
      const result = await getDetails(data.node_id);
      postMessage({ type: "details", key: data.key, data: result });
    }
    if (data.type === "list") {
      const result = await getList(data.node_id, data.key);
      postMessage({ type: "list", data: result });
    }
    if (data.type === "nextstrain") {
      const result = await getNextstrainSubtreeJson(
        data.node_id,
        processedUploadedData.nodes,
        data.config,
        processedUploadedData.mutations
      );
      postMessage({ type: "nextstrain", data: result });
    }
    if (data.type === "cancel_geography") {
      if (activeGeography?.key === data.key) activeGeography.cancelled = true;
      if (pendingGeography?.key === data.key) pendingGeography = null;
    }
    if (data.type === "geography") {
      if (pendingGeography) postMessage({ type: "geography", key: pendingGeography.key, data: { cancelled: true } });
      pendingGeography = { ...data, generation: uploadGeneration };
      if (activeGeography) { activeGeography.cancelled = true; return; }
      while (pendingGeography) {
        const task = pendingGeography; pendingGeography = null; activeGeography = task;
        let lastYield = performance.now();
        const checkpoint = async () => {
          if (task.cancelled || task.generation !== uploadGeneration) throw DENSITY_CANCELLED;
          if (performance.now() - lastYield >= 8) {
            await yieldToMessages(); lastYield = performance.now();
            if (task.cancelled || task.generation !== uploadGeneration) throw DENSITY_CANCELLED;
          }
        };
        try {
          await waitForProcessedData(); await checkpoint();
          const dataset = processedUploadedData;
          dataset.metadataTableIndex ??= buildMetadataTableIndex(dataset.nodes);
          dataset.geographicIndex ??= await buildGeographicIndex(dataset.nodes, dataset.metadataTableIndex,
            Object.keys(dataset.metadataDensityIndex.fieldInfo), checkpoint);
          const result = await queryGeography(dataset.nodes, dataset.metadataTableIndex, dataset.geographicIndex, task.request, checkpoint);
          await checkpoint();
          postMessage({ type: "geography", key: task.key, data: result });
        } catch (error) {
          postMessage({ type: "geography", key: task.key, data: error === DENSITY_CANCELLED ? { cancelled: true } :
            { error: error.message ?? "Unable to load map" } });
        } finally { activeGeography = null; }
      }
    }
    if (data.type === "metadata_table") {
      try {
        await waitForProcessedData();
        const dataset = processedUploadedData;
        dataset.metadataTableIndex ??= buildMetadataTableIndex(dataset.nodes);
        dataset.metadataTableFields ??= new Set(Object.keys(dataset.metadataDensityIndex.fieldInfo));
        const result = queryMetadataTablePage(dataset.nodes, dataset.metadataTableIndex, dataset.metadataTableFields, data.request);
        postMessage({ type: "metadata_table", key: data.key, data: result });
      } catch (error) {
        postMessage({ type: "metadata_table", key: data.key, data: { error: error.message ?? "Unable to load metadata" } });
      }
    }
    if (data.type === "cancel_metadata_density") {
      if (activeDensity?.key === data.key) activeDensity.cancelled = true;
      if (pendingDensity?.key === data.key) pendingDensity = null;
    }
    if (data.type === "metadata_density") {
      if (pendingDensity) {
        postMessage({ type: "metadata_density", data: { key: pendingDensity.key,
          result: { fields: {}, minY: pendingDensity.minY, maxY: pendingDensity.maxY, height: pendingDensity.height, cancelled: true } } });
      }
      pendingDensity = data;
      if (activeDensity) { activeDensity.cancelled = true; return; }
      while (pendingDensity) {
        const request = pendingDensity;
        pendingDensity = null;
        activeDensity = request;
        const generation = uploadGeneration;
        let lastYield = performance.now();
        const checkpoint = async () => {
          if (performance.now() - lastYield < 8) return;
          await yieldToMessages();
          lastYield = performance.now();
          if (request.cancelled || generation !== uploadGeneration) throw DENSITY_CANCELLED;
        };
        try {
          const result = await getMetadataDensity(request, checkpoint);
          await checkpoint();
          postMessage({ type: "metadata_density", data: { key: request.key, result } },
            result.bitmap ? [result.bitmap.rgba.buffer] : []);
        } catch (error) {
          if (error !== DENSITY_CANCELLED) console.error("Metadata density failed", error);
          postMessage({ type: "metadata_density", data: { key: request.key,
            result: { fields: {}, minY: request.minY, maxY: request.maxY, height: request.height, cancelled: true } } });
        } finally { activeDensity = null; }
      }
    }
    if (data.type === "visible_tip_count") {
      const result = await getVisibleTipCount(data);
      postMessage({
        type: "visible_tip_count",
        data: { key: data.key, result },
      });
    }
  }
};
