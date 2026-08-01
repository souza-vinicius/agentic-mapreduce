import type { Batch, Signal } from "./types.js";

/** Pack signals into bounded batches. Same path tends to stay together. */
export function packBatches(args: {
  signals: Signal[];
  batchSize: number;
}): Batch[] {
  if (args.batchSize < 1) {
    throw new Error("batchSize must be >= 1");
  }

  const byPath = new Map<string, Signal[]>();
  for (const signal of args.signals) {
    const list = byPath.get(signal.path) ?? [];
    list.push(signal);
    byPath.set(signal.path, list);
  }

  const groups = [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b));
  const batches: Batch[] = [];
  let current: Signal[] = [];
  let index = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    batches.push({
      id: `batch-${String(index).padStart(4, "0")}`,
      index,
      signals: current,
    });
    index += 1;
    current = [];
  };

  for (const [, group] of groups) {
    if (current.length > 0 && current.length + group.length > args.batchSize) {
      flush();
    }
    for (const signal of group) {
      current.push(signal);
      if (current.length >= args.batchSize) flush();
    }
  }
  flush();
  return batches;
}
