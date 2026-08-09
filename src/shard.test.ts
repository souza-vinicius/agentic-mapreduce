import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { packBatches } from "./batch.js";
import { loadProfile } from "./profile.js";
import { runShard } from "./shard.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("security shard on fixture", () => {
  it("emits lexical signals without --ast", async () => {
    const profile = await loadProfile(path.join(root, "profiles/security.json"));
    const result = await runShard({
      repoRoot: path.join(root, "fixtures/vulnerable-app"),
      profile,
    });
    assert.ok(result.signals.length >= 4);
    const ids = new Set(result.signals.map((s) => s.selectorId));
    assert.ok(ids.has("dangerous-eval"));
    assert.ok(!ids.has("dangerous-eval-ast"));
    assert.ok(
      ids.has("child-process") ||
        ids.has("sql-concat") ||
        ids.has("path-join-user") ||
        ids.has("ssrf-hints"),
    );
    const batches = packBatches({ signals: result.signals, batchSize: 8 });
    assert.ok(batches.length >= 1);
  });

  it("adds structural ast signals when enableAst is true", async () => {
    const profile = await loadProfile(path.join(root, "profiles/security.json"));
    const result = await runShard({
      repoRoot: path.join(root, "fixtures/vulnerable-app"),
      profile,
      enableAst: true,
    });
    const ids = new Set(result.signals.map((s) => s.selectorId));
    assert.ok(ids.has("dangerous-eval"));
    assert.ok(ids.has("dangerous-eval-ast"));
    assert.ok(ids.has("path-join-ast") || ids.has("fetch-ast") || ids.has("child-process-exec-ast"));
  });
});
