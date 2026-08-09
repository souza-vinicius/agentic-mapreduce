import { readFile } from "node:fs/promises";
import path from "node:path";
import { isSupportedAstLanguage } from "./ast.js";
import type { AstSelector, LexicalSelector, ScanProfile, Selector } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

function parseLexicalSelector(sel: Record<string, unknown>, i: number): LexicalSelector {
  if (typeof sel.id !== "string" || typeof sel.description !== "string") {
    throw new Error(`selectors[${i}] needs id and description`);
  }
  if (typeof sel.pattern !== "string") throw new Error(`selectors[${i}].pattern must be a string`);
  const out: LexicalSelector = {
    kind: "lexical",
    id: sel.id,
    description: sel.description,
    pattern: sel.pattern,
  };
  if (typeof sel.flags === "string") out.flags = sel.flags;
  if (isStringArray(sel.include)) out.include = sel.include;
  if (isStringArray(sel.exclude)) out.exclude = sel.exclude;
  return out;
}

function parseAstSelector(sel: Record<string, unknown>, i: number): AstSelector {
  if (typeof sel.id !== "string" || typeof sel.description !== "string") {
    throw new Error(`selectors[${i}] needs id and description`);
  }
  if (typeof sel.language !== "string") {
    throw new Error(`selectors[${i}].language must be a string`);
  }
  if (!isSupportedAstLanguage(sel.language)) {
    throw new Error(`selectors[${i}].language is unsupported: ${sel.language}`);
  }
  if (typeof sel.pattern !== "string") throw new Error(`selectors[${i}].pattern must be a string`);
  const out: AstSelector = {
    kind: "ast",
    id: sel.id,
    description: sel.description,
    language: sel.language,
    pattern: sel.pattern,
  };
  if (isStringArray(sel.include)) out.include = sel.include;
  if (isStringArray(sel.exclude)) out.exclude = sel.exclude;
  return out;
}

export async function loadProfile(profilePath: string): Promise<ScanProfile> {
  const abs = path.resolve(profilePath);
  const raw: unknown = JSON.parse(await readFile(abs, "utf8"));
  if (!isRecord(raw)) throw new Error(`Invalid profile: ${abs}`);

  const id = raw.id;
  const name = raw.name;
  const task = raw.task;
  const description = raw.description;
  const batchSize = raw.batchSize;
  const mapGuidance = raw.mapGuidance;
  const reduceGuidance = raw.reduceGuidance;
  const selectors = raw.selectors;

  if (typeof id !== "string" || typeof name !== "string") {
    throw new Error("profile.id and profile.name must be strings");
  }
  if (
    task !== "security" &&
    task !== "breaking-change" &&
    task !== "migration" &&
    task !== "code-quality" &&
    task !== "custom"
  ) {
    throw new Error(`unsupported profile.task: ${String(task)}`);
  }
  if (typeof description !== "string") throw new Error("profile.description must be a string");
  if (typeof batchSize !== "number" || batchSize < 1) {
    throw new Error("profile.batchSize must be a positive number");
  }
  if (typeof mapGuidance !== "string" || typeof reduceGuidance !== "string") {
    throw new Error("profile.mapGuidance and reduceGuidance must be strings");
  }
  if (!Array.isArray(selectors)) throw new Error("profile.selectors must be an array");

  const parsedSelectors: Selector[] = selectors.map((sel, i) => {
    if (!isRecord(sel)) throw new Error(`selectors[${i}] must be an object`);
    if (sel.kind === "lexical") return parseLexicalSelector(sel, i);
    if (sel.kind === "ast") return parseAstSelector(sel, i);
    throw new Error(`selectors[${i}].kind must be "lexical" or "ast"`);
  });

  const profile: ScanProfile = {
    id,
    name,
    task,
    description,
    batchSize,
    selectors: parsedSelectors,
    mapGuidance,
    reduceGuidance,
  };
  if (typeof raw.verifyGuidance === "string") {
    profile.verifyGuidance = raw.verifyGuidance;
  }
  return profile;
}
