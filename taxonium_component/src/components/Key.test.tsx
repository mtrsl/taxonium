import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import Key from "./Key";
import { metadataLegendRamp } from "../utils/metadata";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { KeyItem } from "./Key";
import { afterEach, beforeEach } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const props = { keyStuff: [], colorByField: "meta_score", config: {},
  setCurrentColorSettingKey: vi.fn(), setColorSettingOpen: vi.fn(),
  hoveredKey: null, setHoveredKey: vi.fn() };
describe("numeric metadata legend", () => {
  it("shows an empty numeric field even when there are no categorical entries", () => {
    expect(renderToStaticMarkup(<Key {...props} numericEmpty />)).toContain("No valid numeric values");
  });
  it("renders a constant range without NaN labels or an invalid one-stop gradient", () => {
    const ramp = metadataLegendRamp({ field: "meta_score", kind: "numeric", min: 4, max: 4 })!;
    const html = renderToStaticMarkup(<Key {...props} colorRamps={{ meta_score: ramp }} />);
    expect(html).toContain("4.00");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("linear-gradient");
  });
});

const categories = (count: number): KeyItem[] => Array.from({ length: count }, (_, i) => ({
  value: `category-${String(i).padStart(5, "0")}`, count: count - i, color: [12, 34, 56],
}));

describe("full categorical legend", () => {
  let element: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const hover = vi.fn(), editKey = vi.fn(), openEditor = vi.fn();
  let current: React.ComponentProps<typeof Key>;
  const render = async (change: Partial<React.ComponentProps<typeof Key>> = {}) => {
    current = { ...current, ...change };
    await act(async () => root.render(<Key {...current} />));
  };
  const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find(node => node.textContent === label || node.getAttribute("aria-label") === label)!;
  const open = async () => act(async () => Array.from(element.querySelectorAll<HTMLButtonElement>("button"))
    .find(node => node.textContent?.startsWith("Show all"))!.click());
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const search = async (value: string) => act(async () => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="Search legend categories"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(280);
    element = document.createElement("div"); document.body.appendChild(element); root = createRoot(element);
    hover.mockClear(); editKey.mockClear(); openEditor.mockClear();
    current = { ...props, colorByField: "meta_group", keyStuff: categories(11), setHoveredKey: hover,
      setCurrentColorSettingKey: editKey, setColorSettingOpen: openEditor, datasetIdentity: vi.fn() };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it("filters empty labels before the preview and shows expansion only above ten entries", async () => {
    for (const count of [0, 1, 10, 11]) {
      await render({ keyStuff: [{ value: "", count: 1000, color: [0, 0, 0] }, ...categories(count)] });
      expect(element.querySelectorAll(".key-text")).toHaveLength(Math.min(count, 10));
      expect(element.textContent?.includes("Show all")).toBe(count > 10);
      expect(element.textContent).not.toContain("...");
    }
    const tied = categories(11).map(item => ({ ...item, count: 2 }));
    await render({ keyStuff: [tied[3], tied[2], tied[1], tied[0], ...tied.slice(4)] });
    expect(element.querySelector(".key-text")?.textContent).toBe(tied[3].value);
    await act(async () => button("Collapse colour legend").click());
    expect(element.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")).toBe("false");
    expect(element.querySelectorAll(".key-text")).toHaveLength(0);
  });

  it("windows 10,000 categories, searches to the last entry, and exposes full labels", async () => {
    await render({ keyStuff: categories(10000) }); await open(); await settle();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Search legend categories");
    expect(dialog()?.querySelectorAll('[role="listitem"]').length).toBeLessThan(25);
    const scroll = dialog()!.querySelector<HTMLElement>('[aria-label="Legend categories"]')!;
    await act(async () => { scroll.scrollTop = 9995 * 36; scroll.dispatchEvent(new Event("scroll", { bubbles: true })); });
    expect(dialog()?.textContent).toContain("category-09999");
    expect(dialog()?.querySelectorAll('[role="listitem"]').length).toBeLessThan(25);
    await search("CATEGORY-09999");
    expect(scroll.scrollTop).toBe(0);
    expect(dialog()?.querySelectorAll('[role="listitem"]')).toHaveLength(1);
    expect(dialog()?.textContent).toContain("1 of 10,000 categories");
    await act(async () => button("Edit colour for category-09999").focus());
    expect(hover).toHaveBeenLastCalledWith("category-09999");
    expect(dialog()?.querySelector('[role="tooltip"]')?.textContent).toBe("category-09999");
    await search("absent"); expect(dialog()?.textContent).toContain("No matching categories");
    await act(async () => button("Close").click()); await settle();
    expect(dialog()).toBeNull(); expect(hover).toHaveBeenLastCalledWith(null);
    expect(document.activeElement?.textContent).toBe("Show all 10,000 categories");
    await open();
    expect(document.querySelector<HTMLInputElement>('[aria-label="Search legend categories"]')!.value).toBe("");
  });

  it("keeps supplied colours live, distinguishes missing values and hands editing off after closure", async () => {
    const long = "a very long category ".repeat(20);
    const entries = [{ value: "Missing", missing: true, count: 90, color: [200, 200, 200] as [number, number, number] },
      { value: "Missing", count: 80, color: [1, 2, 3] as [number, number, number] },
      { value: long, count: 70, color: [4, 5, 6] as [number, number, number] }, ...categories(11)];
    await render({ keyStuff: entries }); await open();
    await search("Missing");
    expect(dialog()?.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    await act(async () => dialog()!.querySelector<HTMLButtonElement>('[aria-label="Missing metadata"]')!.click());
    expect(openEditor).not.toHaveBeenCalled();
    const literal = dialog()!.querySelector<HTMLButtonElement>('[aria-label="Edit colour for Missing"]')!;
    expect(literal.querySelector("span")!.style.backgroundColor).toBe("rgb(1, 2, 3)");
    await render({ keyStuff: entries.map(item => item.missing ? item : { ...item, color: [9, 8, 7] }) });
    expect(literal.querySelector("span")!.style.backgroundColor).toBe("rgb(9, 8, 7)");
    await search("a very long");
    await act(async () => dialog()!.querySelector<HTMLButtonElement>(".key-text")!.focus());
    expect(dialog()?.querySelector('[role="tooltip"]')?.textContent).toBe(long);
    await act(async () => dialog()!.querySelector<HTMLButtonElement>(".key-text")!.click());
    expect(dialog()).toBeNull(); expect(openEditor).not.toHaveBeenCalled();
    await settle();
    expect(editKey).toHaveBeenLastCalledWith(long); expect(openEditor).toHaveBeenCalledWith(true);
  });

  it("resets scroll on membership/order changes, including an empty live list", async () => {
    await render({ keyStuff: categories(100) }); await open();
    const scroll = dialog()!.querySelector<HTMLElement>('[aria-label="Legend categories"]')!;
    await act(async () => { scroll.scrollTop = 1000; scroll.dispatchEvent(new Event("scroll", { bubbles: true })); });
    await render({ keyStuff: categories(100).map(item => ({ ...item, color: [1, 2, 3] })) });
    expect(scroll.scrollTop).toBe(1000);
    await render({ keyStuff: categories(20) }); expect(scroll.scrollTop).toBe(0);
    await render({ keyStuff: [] }); expect(dialog()?.textContent).toContain("No matching categories");
    await act(async () => button("Close").click()); expect(element.textContent).toBe("");
  });

  it("closes for field, dataset, locus and numeric mode changes and cancels a pending edit", async () => {
    await render();
    for (const change of [{ colorByField: "meta_other" }, { datasetIdentity: vi.fn() },
      { colorByField: "genotype", colorByGene: "S", colorByPosition: 2 }, { colorByPosition: 3 },
      { numericEmpty: true }]) {
      await open(); await render(change); expect(dialog()).toBeNull();
    }
    await render({ numericEmpty: false }); await open();
    await act(async () => dialog()!.querySelector<HTMLButtonElement>(".key-text")!.click());
    await render({ datasetIdentity: vi.fn() }); await settle();
    expect(openEditor).not.toHaveBeenCalled();
  });
});
