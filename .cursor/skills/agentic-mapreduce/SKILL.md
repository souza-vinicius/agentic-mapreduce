---
name: agentic-mapreduce
description: >-
  Run whole-repo Agentic MapReduce in Cursor (Plan → Shard → Map → Reduce → Verify).
  Use for security scans, breaking-change detection, large migrations, or any task
  that is only trustworthy if the entire codebase was considered.
---

# Agentic MapReduce (Cursor)

Replicates Devin's Agentic MapReduce pattern using:

- **Deterministic Shard** via the `amr` CLI (no model in the loop)
- **Parallel Map** via Cursor subagents (`amr-map-worker`) / Task tool / Cloud Agents
- **Reduce / Verify** via `amr-reducer` and `amr-verifier`
- **Plan** via `amr-planner` to author selectors

## When to use

Use when completeness matters: security, breaking changes, migrations, quality gates.
Do **not** use for local bugfixes or single-module features.

## Pipeline

```text
Plan (amr-planner) → Shard (amr CLI) → Map (N × amr-map-worker) → Reduce (amr-reducer) → Verify (amr-verifier)
```

### 1. Plan

Delegate to subagent `amr-planner` (or run `amr prompt plan --repo <path> --task security`).
Result: a profile JSON under `profiles/` with lexical selectors.

### 2. Shard (deterministic)

```bash
npm run build
node dist/cli.js shard --repo <target-repo> --profile profiles/security.json --out .amr/runs/<id>
```

This writes `shard-manifest.json`, per-batch JSON files, and `summary.json`.
Coverage is the finite batch queue. Files with zero signals are dropped.

Incremental:

```bash
node dist/cli.js shard --repo <target-repo> --profile profiles/security.json --incremental <git-sha>
```

### 3. Map (parallel)

For each `batch-*.json` in the run dir, launch an `amr-map-worker` subagent in parallel.
Build the prompt with:

```bash
node dist/cli.js prompt map --manifest .amr/runs/<id>/shard-manifest.json --batch batch-0000
```

Parent agent: use the Task tool with `subagent_type` matching custom agent when available, or paste the prompt into parallel Tasks.
Write each worker's JSON array to `.amr/runs/<id>/findings/<batch-id>.json`.

### 4. Reduce

Concatenate findings to `.amr/runs/<id>/findings.jsonl`, then:

```bash
node dist/cli.js prompt reduce --manifest .amr/runs/<id>/shard-manifest.json --findings .amr/runs/<id>/findings.jsonl
```

Run `amr-reducer` with that prompt. Save `reduce-result.json`.

### 5. Verify (optional)

For each P0/P1 finding, `amr prompt verify --finding ...` and run `amr-verifier`.

## Cost levers

| Lever | Effect |
|-------|--------|
| `batchSize` in profile / `--batch-size` | Workers × tokens |
| Selector recall vs precision | Broad selectors cost more Map; narrow miss bugs |
| `--incremental` | Pay for the diff |
| Skip Verify | Faster, weaker proof |

## Parent orchestrator checklist

1. Confirm the task is whole-repo.
2. Plan or pick a profile.
3. Run Shard; read `summary.json`.
4. If `signalCount` is 0, fix selectors (Plan again) — do not invent a search-driven scan.
5. Fan out Map workers in parallel (one Task per batch).
6. Reduce once.
7. Verify serious items.
8. Report chains + confirmed findings to the user.

## Profiles shipped

- `profiles/security.json`
- `profiles/breaking-change.json` (refine symbols after Plan)
- `profiles/migration.json` (refine package/symbol names)
