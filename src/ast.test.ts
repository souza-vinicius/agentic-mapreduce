import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { parseSource, runAstSelector } from "./ast.js";
import { runShard } from "./shard.js";
import { asRelPath, type ScanProfile } from "./types.js";

describe("ast selectors", () => {
  it("matches real eval calls and ignores comments/strings", async () => {
    const text = `
// eval(fake)
const s = "eval(x)";
eval(userInput);
`;
    const root = await parseSource({ language: "javascript", text });
    assert.ok(root);
    const signals = runAstSelector({
      selector: {
        kind: "ast",
        id: "dangerous-eval-ast",
        description: "eval",
        language: "javascript",
        pattern: "eval($ARG)",
      },
      rel: asRelPath("sample.js"),
      root,
    });
    assert.equal(signals.length, 1);
    assert.match(signals[0]!.evidence, /^eval\(userInput\)$/);
  });

  it("skips ast selectors unless enableAst is true", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "amr-ast-"));
    await writeFile(
      path.join(dir, "app.js"),
      `eval(x);\n`,
      "utf8",
    );
    const profile: ScanProfile = {
      id: "t",
      name: "t",
      task: "custom",
      description: "t",
      batchSize: 8,
      mapGuidance: "",
      reduceGuidance: "",
      selectors: [
        {
          kind: "ast",
          id: "dangerous-eval-ast",
          description: "eval",
          language: "javascript",
          pattern: "eval($ARG)",
          include: ["**/*.js"],
        },
      ],
    };
    const off = await runShard({ repoRoot: dir, profile, enableAst: false });
    assert.equal(off.signals.length, 0);
    const on = await runShard({ repoRoot: dir, profile, enableAst: true });
    assert.equal(on.signals.length, 1);
    assert.equal(on.signals[0]!.selectorId, "dangerous-eval-ast");
  });
});
