import { isMissingMetadata } from "./metadata";

/** Compact exact categories: zero is missing; codes are local to this index. */
export interface CategoryIndex {
  codes: Uint32Array;
  labels: string[];
  counts: Uint32Array;
  touched: Uint32Array;
}

export async function buildCategoryIndex(
  length: number, valueAt: (index: number) => unknown,
  checkpoint: () => Promise<void>,
): Promise<CategoryIndex> {
  const codes = new Uint32Array(length);
  const labels = [""];
  const dictionary = new Map<string, number>();
  for (let i = 0; i < length; i++) {
    if (i % 65536 === 0) await checkpoint();
    const value = valueAt(i);
    if (isMissingMetadata(value)) continue;
    const label = String(value);
    let code = dictionary.get(label);
    if (code === undefined) {
      code = labels.length;
      dictionary.set(label, code);
      labels.push(label);
    }
    codes[i] = code;
  }
  return { codes, labels, counts: new Uint32Array(labels.length), touched: new Uint32Array(labels.length) };
}

export function categoryRangeMode(index: CategoryIndex, start: number, end: number): string | null {
  const { codes, labels, counts, touched } = index;
  let best = 0, bestCount = 0, touchedCount = 0;
  for (let i = start; i < end; i++) {
    const code = codes[i];
    if (!code) continue;
    if (!counts[code]) touched[touchedCount++] = code;
    const count = ++counts[code];
    if (count > bestCount || (count === bestCount && labels[code] < labels[best])) {
      best = code;
      bestCount = count;
    }
  }
  for (let i = 0; i < touchedCount; i++) counts[touched[i]] = 0;
  return best ? labels[best] : null;
}
