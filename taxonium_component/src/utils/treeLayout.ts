import type { SubViewState } from "../types/view";
import type { DeckSize } from "../types/common";

export type TreeLayout = "standard" | "rotated";
export interface ViewportRect extends DeckSize { x: number; y: number }
export interface TreeViewLayout {
  rotated: boolean;
  tree: ViewportRect;
  metadata: ViewportRect;
  /** Dimensions measured along canonical branch (x) and sample (y) axes. */
  canonicalTreeSize: DeckSize;
  metadataThickness: number;
}

export const parseTreeLayout = (value: unknown): TreeLayout =>
  value === "rotated" ? "rotated" : "standard";

export const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const swapAxesMatrix = [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The axis swap is its own inverse; data and backend coordinates stay canonical. */
export function orientPoint(point: readonly number[], rotated: boolean): [number, number] {
  return rotated ? [point[1], point[0]] : [point[0], point[1]];
}

export function orientCamera<T extends SubViewState>(camera: T, rotated: boolean): T {
  if (!rotated) return camera;
  return {
    ...camera,
    target: [...orientPoint(camera.target, true), ...camera.target.slice(2)],
    zoom: Array.isArray(camera.zoom) ? [camera.zoom[1], camera.zoom[0]] : camera.zoom,
  } as T;
}

export function getTreeViewLayout(size: DeckSize, thickness: number, preference: TreeLayout, treenome: boolean): TreeViewLayout {
  const rotated = preference === "rotated" && !treenome;
  const width = Math.max(0, size.width * (treenome ? 0.4 : 1));
  const height = Math.max(0, size.height);
  const metadataThickness = Math.max(0, Math.min(thickness, Math.max((rotated ? height : width) - 80, 0)));
  const tree = { x: 0, y: 0, width: width - (rotated ? 0 : metadataThickness), height: height - (rotated ? metadataThickness : 0) };
  const metadata = rotated
    ? { x: 0, y: tree.height, width, height: metadataThickness }
    : { x: tree.width, y: 0, width: metadataThickness, height };
  return { rotated, tree, metadata, metadataThickness,
    canonicalTreeSize: rotated ? { width: tree.height, height: tree.width } : { width: tree.width, height: tree.height } };
}
