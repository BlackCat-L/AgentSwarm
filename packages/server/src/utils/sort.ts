// ── Sorting visualisation: step-by-step tracking ──────────

export interface SortStep {
  array: number[];
  i: number;
  j: number;
  swapped: boolean;
  phase: "comparing" | "swapping" | "done";
}

export interface SortResult {
  sorted: number[];
  steps: SortStep[];
}

function generateRandomList(count: number, min: number, max: number): number[] {
  const list: number[] = [];
  for (let n = 0; n < count; n++) {
    list.push(Math.floor(Math.random() * (max - min + 1)) + min);
  }
  return list;
}

/** Bubble sort descending (large -> small), recording every step */
function bubbleSortDescending(arr: number[]): SortResult {
  const array = [...arr];
  const steps: SortStep[] = [];

  for (let i = 0; i < array.length - 1; i++) {
    for (let j = 0; j < array.length - 1 - i; j++) {
      steps.push({ array: [...array], i, j, swapped: false, phase: "comparing" });

      // noUncheckedIndexedAccess — j is always in-bounds here
      if (array[j]! < array[j + 1]!) {
        const tmp = array[j]!;
        array[j] = array[j + 1]!;
        array[j + 1] = tmp;
        steps.push({ array: [...array], i, j, swapped: true, phase: "swapping" });
      }
    }
  }

  steps.push({ array: [...array], i: -1, j: -1, swapped: false, phase: "done" });
  return { sorted: array, steps };
}

/** Bubble sort ascending (small -> large), recording every step */
function bubbleSortAscending(arr: number[]): SortResult {
  const array = [...arr];
  const steps: SortStep[] = [];

  for (let i = 0; i < array.length - 1; i++) {
    for (let j = 0; j < array.length - 1 - i; j++) {
      steps.push({ array: [...array], i, j, swapped: false, phase: "comparing" });

      if (array[j]! > array[j + 1]!) {
        const tmp = array[j]!;
        array[j] = array[j + 1]!;
        array[j + 1] = tmp;
        steps.push({ array: [...array], i, j, swapped: true, phase: "swapping" });
      }
    }
  }

  steps.push({ array: [...array], i: -1, j: -1, swapped: false, phase: "done" });
  return { sorted: array, steps };
}

export interface SortServiceResult {
  original: number[];
  descending: SortResult;
  ascending: SortResult;
}

export function runSortService(count = 10, min = 0, max = 100): SortServiceResult {
  if (count < 2) throw new Error("count must be >= 2");
  if (min >= max) throw new Error("min must be < max");

  const original = generateRandomList(count, min, max);
  const descending = bubbleSortDescending(original);
  const ascending = bubbleSortAscending(original);

  return { original, descending, ascending };
}

// ── Simple sorting (no step tracking, for standalone use) ──────────

export function simpleSortAscending(arr: number[]): number[] {
  const array = [...arr];
  for (let i = 0; i < array.length - 1; i++) {
    for (let j = 0; j < array.length - 1 - i; j++) {
      if (array[j]! > array[j + 1]!) {
        const tmp = array[j]!;
        array[j] = array[j + 1]!;
        array[j + 1] = tmp;
      }
    }
  }
  return array;
}

export function simpleSortDescending(arr: number[]): number[] {
  return simpleSortAscending(arr).reverse();
}

// ── Standalone execution ──────────────────────────────────────────
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  const count = 10;
  const min = 1;
  const max = 100;

  const original = generateRandomList(count, min, max);
  const ascending = simpleSortAscending(original);
  const descending = simpleSortDescending(original);

  console.log(`\n=== 排序演示 ===\n`);
  console.log(`原始数组: [${original.join(", ")}]`);
  console.log(`升序结果: [${ascending.join(", ")}]`);
  console.log(`降序结果: [${descending.join(", ")}]\n`);
}
