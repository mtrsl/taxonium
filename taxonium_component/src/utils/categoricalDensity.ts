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

function modeCounter(index: CategoryIndex) {
  const { codes, labels, counts, touched } = index;
  let best = 0, bestCount = 0, touchedCount = 0;
  return {
    add(i: number) {
      const code = codes[i];
      if (!code) return;
      if (!counts[code]) touched[touchedCount++] = code;
      const count = ++counts[code];
      if (count > bestCount || (count === bestCount && labels[code] < labels[best])) {
        best = code; bestCount = count;
      }
    },
    result: () => best ? labels[best] : null,
    clear() { for (let i = 0; i < touchedCount; i++) counts[touched[i]] = 0; },
  };
}

export function categoryRangeMode(index: CategoryIndex, start: number, end: number): string | null {
  const counter = modeCounter(index);
  for (let i = start; i < end; i++) counter.add(i);
  const result = counter.result(); counter.clear(); return result;
}

/** Geographic groups are not contiguous in tree order; retain exact mode/tie semantics. */
export async function categoryGroupMode(index: CategoryIndex, head: number, next: Int32Array,
  checkpoint: () => Promise<void>): Promise<string | null> {
  const counter = modeCounter(index);
  try {
    let visited = 0;
    for (let i = head; i !== -1; i = next[i]) {
      if (visited++ % 8192 === 0) await checkpoint();
      counter.add(i);
    }
    return counter.result();
  } finally { counter.clear(); }
}
