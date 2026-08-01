#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { packBatches } from "./batch.js";
import { changedFilesSince, currentCommit } from "./git.js";
import { loadProfile } from "./profile.js";
import { runShard } from "./shard.js";
import type { ShardManifest } from "./types.js";

function usage(): never {
  console.error(`amr — Agentic MapReduce (Cursor)

Usage:
  amr shard --repo <path> --profile <profile.json> [--out <dir>] [--batch-size N] [--incremental <commit>]
  amr prompt map --manifest <shard-manifest.json> --batch <batch-id>
  amr prompt reduce --manifest <shard-manifest.json> --findings <findings.jsonl>
  amr prompt plan --repo <path> --task <security|breaking-change|migration>
  amr prompt verify --finding <finding.json>

Stages:
  Plan   → Cursor agent amr-planner (writes/edits profile selectors)
  Shard  → this CLI (deterministic; no model)
  Map    → Cursor agent amr-map-worker (one per batch; use Task tool in parallel)
  Reduce → Cursor agent amr-reducer
  Verify → Cursor agent amr-verifier (optional)
`);
  process.exit(1);
}

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

async function cmdShard(args: string[]): Promise<void> {
  const repo = getFlag(args, "--repo") ?? process.cwd();
  const profilePath = getFlag(args, "--profile");
  if (!profilePath) usage();
  const outDir =
    getFlag(args, "--out") ??
    path.join(repo, ".amr", "runs", new Date().toISOString().replaceAll(":", "-"));
  const batchSizeFlag = getFlag(args, "--batch-size");
  const since = getFlag(args, "--incremental");

  const profile = await loadProfile(profilePath);
  if (batchSizeFlag) profile.batchSize = Number(batchSizeFlag);

  const onlyPaths = since
    ? await changedFilesSince({ repoRoot: repo, sinceCommit: since })
    : undefined;
  const shard = await runShard({
    repoRoot: repo,
    profile,
    ...(onlyPaths ? { onlyPaths } : {}),
  });
  const batches = packBatches({ signals: shard.signals, batchSize: profile.batchSize });

  const manifest: ShardManifest = {
    kind: "amr.shard_manifest",
    version: 1,
    profileId: profile.id,
    repoRoot: path.resolve(repo),
    createdAt: new Date().toISOString(),
    fileCountScanned: shard.fileCountScanned,
    fileCountMatched: shard.fileCountMatched,
    signalCount: shard.signals.length,
    batchSize: profile.batchSize,
    batches,
    droppedFileCount: shard.droppedFileCount,
  };

  await mkdir(outDir, { recursive: true });
  const manifestPath = path.join(outDir, "shard-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(path.join(outDir, "profile.snapshot.json"), JSON.stringify(profile, null, 2));

  for (const batch of batches) {
    await writeFile(path.join(outDir, `${batch.id}.json`), JSON.stringify(batch, null, 2));
  }

  const commit = await currentCommit(repo);
  const summary = {
    outDir,
    manifestPath,
    commit,
    batches: batches.length,
    signals: shard.signals.length,
    filesMatched: shard.fileCountMatched,
    filesDropped: shard.droppedFileCount,
    filesScanned: shard.fileCountScanned,
  };
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

function mapPrompt(args: {
  repoRoot: string;
  profileGuidance: string;
  batchId: string;
  batchJson: string;
}): string {
  return `You are the Agentic MapReduce MAP worker (amr-map-worker).

Repository root: ${args.repoRoot}
Batch id: ${args.batchId}

## Guidance from the scan profile
${args.profileGuidance}

## Rules
- Investigate ONLY the signals in this batch. You may read surrounding code those signals point to.
- Apply a strict false-positive gate. Prefer fewer true findings over many speculative ones.
- Do not modify the repository.
- Emit a JSON array of findings as the final answer (no markdown fences), each with:
  id, title, severity (P0|P1|P2|P3), confidence (high|medium|low), cwe?, paths[], rootCause, preconditions[], evidence, batchId
- If nothing survives the FP gate, emit [].

## Batch
${args.batchJson}
`;
}

function reducePrompt(args: {
  repoRoot: string;
  guidance: string;
  findingsJsonl: string;
}): string {
  return `You are the Agentic MapReduce REDUCE worker (amr-reducer).

Repository root: ${args.repoRoot}

## Guidance
${args.guidance}

## Rules
- Reason over the findings below (compressed conclusions), not the whole repo.
- Deduplicate overlapping findings.
- Compose cross-batch attack chains when preconditions link (e.g. unauthenticated ID leak + ID-gated RCE).
- Triage remaining items into P0/P1/P2/P3.
- Emit JSON: { "kind":"amr.reduce_result", "version":1, "findings":[...], "chains":[...], "notes":[...] }

## Findings (JSONL)
${args.findingsJsonl}
`;
}

function planPrompt(args: { repoRoot: string; task: string }): string {
  return `You are the Agentic MapReduce PLANNER (amr-planner).

Repository: ${args.repoRoot}
Task: ${args.task}

Study the repo structure, frameworks, entry points, and conventions.
Author or refine a scan profile JSON with lexical selectors that catch relevant code with high recall.
Selectors must be concrete regexes (kind: "lexical") that can run with no model in the loop.

Write the profile to profiles/<task>.generated.json (or update an existing profile).
Explain which selectors you chose and known recall gaps.
`;
}

function verifyPrompt(args: { findingJson: string }): string {
  return `You are the Agentic MapReduce VERIFIER (amr-verifier).

Attempt to reproduce the finding against a running build or the tightest available test harness.
Classify as confirmed | false_positive | inconclusive.
Do not weaken the finding just because reproduction is hard — use inconclusive.
Emit JSON: { "findingId", "status", "notes" }

## Finding
${args.findingJson}
`;
}

async function cmdPrompt(args: string[]): Promise<void> {
  const kind = args[0];
  if (kind === "plan") {
    const repo = getFlag(args, "--repo") ?? process.cwd();
    const task = getFlag(args, "--task") ?? "security";
    console.log(planPrompt({ repoRoot: repo, task }));
    return;
  }
  if (kind === "map") {
    const manifestPath = getFlag(args, "--manifest");
    const batchId = getFlag(args, "--batch");
    if (!manifestPath || !batchId) usage();
    const { readFile } = await import("node:fs/promises");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ShardManifest;
    const batch = manifest.batches.find((b) => b.id === batchId);
    if (!batch) throw new Error(`batch not found: ${batchId}`);
    const profilePath = path.join(path.dirname(manifestPath), "profile.snapshot.json");
    const profile = JSON.parse(await readFile(profilePath, "utf8")) as { mapGuidance: string };
    console.log(
      mapPrompt({
        repoRoot: manifest.repoRoot,
        profileGuidance: profile.mapGuidance,
        batchId,
        batchJson: JSON.stringify(batch, null, 2),
      }),
    );
    return;
  }
  if (kind === "reduce") {
    const manifestPath = getFlag(args, "--manifest");
    const findingsPath = getFlag(args, "--findings");
    if (!manifestPath || !findingsPath) usage();
    const { readFile } = await import("node:fs/promises");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ShardManifest;
    const findingsJsonl = await readFile(findingsPath, "utf8");
    const profile = JSON.parse(
      await readFile(path.join(path.dirname(manifestPath), "profile.snapshot.json"), "utf8"),
    ) as { reduceGuidance: string };
    console.log(
      reducePrompt({
        repoRoot: manifest.repoRoot,
        guidance: profile.reduceGuidance,
        findingsJsonl,
      }),
    );
    return;
  }
  if (kind === "verify") {
    const findingPath = getFlag(args, "--finding");
    if (!findingPath) usage();
    const { readFile } = await import("node:fs/promises");
    console.log(verifyPrompt({ findingJson: await readFile(findingPath, "utf8") }));
    return;
  }
  usage();
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "shard") return cmdShard(rest);
  if (cmd === "prompt") return cmdPrompt(rest);
  usage();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
