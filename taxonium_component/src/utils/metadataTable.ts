import type { Node } from "../types/node";
import { METADATA_TABLE_MAX_FIELDS, METADATA_TABLE_PAGE_SIZE,
  type MetadataTablePage, type MetadataTableRequest } from "../types/metadataTable";

export interface MetadataTableIndex {
  tips: Uint32Array;
  starts: Uint32Array;
  ends: Uint32Array;
  // Normalized imports use node_id === array position; avoid a large Map there.
  positions?: Map<number, number>;
}

/** A lazy structural index only: metadata stays on the existing worker nodes. */
export function buildMetadataTableIndex(nodes: Node[]): MetadataTableIndex {
  const size = nodes.length;
  const positions = nodes.every((node, i) => node.node_id === i) ? undefined :
    new Map(nodes.map((node, i) => [node.node_id, i]));
  if (positions && positions.size !== size) throw new Error("Duplicate tree node IDs");
  const head = new Int32Array(size).fill(-1);
  const tail = new Int32Array(size).fill(-1);
  const next = new Int32Array(size).fill(-1);
  const roots: number[] = [];
  nodes.forEach((node, i) => {
    if (node.parent_id === undefined || node.parent_id === node.node_id) { roots.push(i); return; }
    const parent = positions ? positions.get(node.parent_id) : node.parent_id;
    if (parent === undefined || parent < 0 || parent >= size || !Number.isInteger(parent))
      throw new Error("Tree contains an invalid parent ID");
    if (tail[parent] === -1) head[parent] = i;
    else next[tail[parent]] = i;
    tail[parent] = i;
  });
  const starts = new Uint32Array(size), ends = new Uint32Array(size);
  const tips = new Uint32Array(size), stack = new Int32Array(size);
  const visited = new Uint8Array(size);
  let tipCount = 0, visitedCount = 0;
  for (const root of roots) {
    let depth = 0; stack[0] = root;
    while (depth >= 0) {
      const position = stack[depth], node = nodes[position];
      if (!visited[position]) {
        visited[position] = 1; visitedCount++;
        starts[position] = tipCount;
        if (node.is_tip || (node.is_tip === undefined && node.num_tips === 1)) tips[tipCount++] = position;
      }
      const child = head[position];
      if (child !== -1) {
        head[position] = next[child];
        if (visited[child]) throw new Error("Tree contains a cycle");
        stack[++depth] = child;
      } else { ends[position] = tipCount; depth--; }
    }
  }
  if (visitedCount !== size) throw new Error("Tree contains a cycle or unreachable nodes");
  return { tips: tips.slice(0, tipCount), starts, ends, positions };
}

export function queryMetadataTablePage(nodes: Node[], index: MetadataTableIndex,
  availableFields: Set<string>, request: MetadataTableRequest): MetadataTablePage {
  if (!Number.isSafeInteger(request.pageIndex) || request.pageIndex < 0) throw new Error("Invalid table page");
  if (!Array.isArray(request.fields) || request.fields.length > METADATA_TABLE_MAX_FIELDS ||
      request.fields.some(field => typeof field !== "string" || !availableFields.has(field)))
    throw new Error("Invalid metadata columns (maximum 32)");
  // Field projection is restricted to metadata. The configured sample identifier is separate.
  if (typeof request.nameField !== "string" || !request.nameField ||
      ["__proto__", "prototype", "constructor"].includes(request.nameField)) throw new Error("Invalid sample identifier field");
  let start = 0, end = index.tips.length;
  if (request.selectedNodeId !== null) {
    const id = typeof request.selectedNodeId === "number" ? request.selectedNodeId : Number(request.selectedNodeId);
    const position = index.positions ? index.positions.get(id) : id;
    if (!Number.isSafeInteger(id) || position === undefined || position < 0 || position >= nodes.length || nodes[position].node_id !== id)
      throw new Error("Selected node is not in this dataset");
    start = index.starts[position]; end = index.ends[position];
  }
  const total = end - start;
  const pageIndex = Math.min(request.pageIndex, Math.max(0, Math.ceil(total / METADATA_TABLE_PAGE_SIZE) - 1));
  const first = start + pageIndex * METADATA_TABLE_PAGE_SIZE;
  const fields = [...new Set(request.fields)];
  const rows = [];
  for (let i = first; i < Math.min(end, first + METADATA_TABLE_PAGE_SIZE); i++) {
    const node = nodes[index.tips[i]];
    rows.push({ nodeId: node.node_id, name: Object.hasOwn(node, request.nameField) ? node[request.nameField] : null,
      values: fields.map(field => Object.hasOwn(node, field) ? node[field] : null) });
  }
  return { total, pageIndex, fields, rows };
}

export const metadataTableText = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

/** Fixed-size virtual window, shared by rows, columns and the column chooser. */
export function tableWindow(offset: number, viewport: number, size: number, count: number, overscan = 2, max = Infinity) {
  const start = Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(offset / size) - overscan));
  const end = Math.min(count, start + max, Math.ceil((offset + viewport) / size) + overscan);
  return { start, end: Math.max(start, end) };
}
