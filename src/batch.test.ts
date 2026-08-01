import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packBatches } from "./batch.js";
import { asRelPath, type Signal } from "./types.js";

function sig(path: string, line: number): Signal {
  return {
    id: `${path}:${line}`,
    selectorId: "s",
    path: asRelPath(path),
    line,
    column: 1,
    evidence: "x",
  };
}

describe("packBatches", () => {
  it("keeps same-path signals together when they fit", () => {
    const batches = packBatches({
      batchSize: 2,
      signals: [sig("a.ts", 1), sig("a.ts", 2), sig("b.ts", 1)],
    });
    assert.equal(batches.length, 2);
    assert.equal(batches[0]?.signals.length, 2);
    assert.equal(batches[0]?.signals[0]?.path, "a.ts");
    assert.equal(batches[1]?.signals.length, 1);
    assert.equal(batches[1]?.signals[0]?.path, "b.ts");
  });

  it("splits when batchSize is 1", () => {
    const batches = packBatches({
      batchSize: 1,
      signals: [sig("a.ts", 1), sig("b.ts", 1)],
    });
    assert.equal(batches.length, 2);
  });
});
