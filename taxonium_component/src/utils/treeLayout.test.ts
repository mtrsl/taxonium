import { expect, it } from "vitest";
import { OrthographicViewport } from "@deck.gl/core";
import { getTreeViewLayout, orientCamera, orientPoint, parseTreeLayout } from "./treeLayout";
import computeBounds from "./computeBounds";

it("preserves camera round trips, scalar zoom and left-to-right sample order", () => {
  const camera = { target: [200, 900, 0] as [number, number, number], zoom: [1, -2] as [number, number] };
  expect(orientCamera(orientCamera(camera, true), true)).toEqual(camera);
  expect(orientCamera({ ...camera, zoom: 3 }, true).zoom).toBe(3);
  expect(orientPoint([200, 100], true)[0]).toBeLessThan(orientPoint([200, 200], true)[0]);
  expect(parseTreeLayout(undefined)).toBe("standard");
  expect(parseTreeLayout("invalid")).toBe("standard");
  expect(parseTreeLayout("rotated")).toBe("rotated");
});

it("aligns tree tips and metadata through actual viewport projection and canonical bounds", () => {
  for (const orientation of ["standard", "rotated"] as const) {
    const layout = getTreeViewLayout({ width: 1200, height: 800 }, 200, orientation, false);
    const camera = { target: [200, 900] as [number, number], zoom: [1, -2] as [number, number] };
    const tree = new OrthographicViewport({ ...layout.tree, ...orientCamera(camera, layout.rotated) });
    const metadata = new OrthographicViewport({ ...layout.metadata, ...orientCamera({ target: [100, 900], zoom: [0, -2] }, layout.rotated) });
    const sampleAxis = layout.rotated ? 0 : 1;
    for (const y of [100, 900, 1500]) {
      const treeTip = tree.project(orientPoint([250, y], layout.rotated));
      const cell = metadata.project(orientPoint([24, y], layout.rotated));
      expect(treeTip[sampleAxis]).toBeCloseTo(cell[sampleAxis]);
    }
    const bounds = computeBounds({ ...camera }, layout.canonicalTreeSize);
    const topLeft = orientPoint(tree.unproject([0, 0]), layout.rotated);
    expect(topLeft[0]).toBeCloseTo(bounds.min_x);
    expect(topLeft[1]).toBeCloseTo(bounds.min_y);
    expect(layout.canonicalTreeSize.height).toBe(layout.rotated ? tree.width : tree.height);
  }
});

it("bounds metadata space on resize, omits empty panels and overrides rotation for Treenome", () => {
  const size = { width: 390, height: 400 };
  const rotated = getTreeViewLayout(size, 900, "rotated", false);
  expect(rotated.tree.height).toBe(80);
  expect(rotated.metadata.height).toBe(320);
  expect(getTreeViewLayout(size, 0, "rotated", false).tree).toEqual({ x: 0, y: 0, ...size });
  const treenome = getTreeViewLayout(size, 120, "rotated", true);
  expect(treenome.rotated).toBe(false);
  expect(treenome.tree.width + treenome.metadata.width).toBe(156);
});
