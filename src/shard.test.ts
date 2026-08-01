import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { packBatches } from "./batch.js";
import { loadProfile } from "./profile.js";
import { runShard } from "./shard.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("security shard on fixture", () => {
  it("emits signals for eval and other sinks", async () => {
    const profile = await loadProfile(path.join(root, "profiles/security.json"));
    const result = await runShard({
      repoRoot: path.join(root, "fixtures/vulnerable-app"),
      profile,
    });
    assert.ok(result.signals.length >= 4);
    const ids = new Set(result.signals.map((s) => s.selectorId));
    assert.ok(ids.has("dangerous-eval"));
    assert.ok(
      ids.has("child-process") ||
        ids.has("sql-concat") ||
        ids.has("path-join-user") ||
        ids.has("ssrf-hints"),
    );
    const batches = packBatches({ signals: result.signals, batchSize: 8 });
    assert.ok(batches.length >= 1);
  });
});
