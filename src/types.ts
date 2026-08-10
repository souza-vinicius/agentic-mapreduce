/** Branded path relative to the scanned repo root. */
export type RelPath = string & { readonly __brand: "RelPath" };

export type Severity = "P0" | "P1" | "P2" | "P3";

export type SelectorKind = "lexical" | "ast";

export type LexicalSelector = {
  kind: "lexical";
  id: string;
  description: string;
  /** JS regex source (no surrounding slashes). */
  pattern: string;
  flags?: string;
  /** Glob of files this selector applies to. Default: all text-ish sources. */
  include?: string[];
  exclude?: string[];
};

export type AstSelector = {
  kind: "ast";
  id: string;
  description: string;
  /** ast-grep language alias, e.g. javascript | typescript | python. */
  language: string;
  /** Structural pattern, e.g. "eval($ARG)". */
  pattern: string;
  /** Glob of files this selector applies to. Default: language extensions. */
  include?: string[];
  exclude?: string[];
};

export type Selector = LexicalSelector | AstSelector;

export type ScanProfile = {
  id: string;
  name: string;
  task:
    | "security"
    | "breaking-change"
    | "migration"
    | "code-quality"
    | "custom";
  description: string;
  batchSize: number;
  selectors: Selector[];
  mapGuidance: string;
  reduceGuidance: string;
  verifyGuidance?: string;
};

export type Signal = {
  id: string;
  selectorId: string;
  path: RelPath;
  line: number;
  column: number;
  evidence: string;
};

export type Batch = {
  id: string;
  index: number;
  signals: Signal[];
};

export type ShardManifest = {
  kind: "amr.shard_manifest";
  version: 1;
  profileId: string;
  repoRoot: string;
  createdAt: string;
  fileCountScanned: number;
  fileCountMatched: number;
  signalCount: number;
  batchSize: number;
  batches: Batch[];
  droppedFileCount: number;
};

export type Finding = {
  id: string;
  title: string;
  severity: Severity;
  confidence: "high" | "medium" | "low";
  cwe?: string;
  paths: RelPath[];
  rootCause: string;
  preconditions: string[];
  evidence: string;
  batchId: string;
};

export type AttackChain = {
  id: string;
  title: string;
  severity: Severity;
  findingIds: string[];
  narrative: string;
};

export type ReduceResult = {
  kind: "amr.reduce_result";
  version: 1;
  findings: Finding[];
  chains: AttackChain[];
  notes: string[];
};

export type VerifyStatus = "confirmed" | "false_positive" | "inconclusive";

export type VerifyResult = {
  findingId: string;
  status: VerifyStatus;
  notes: string;
};

export function asRelPath(path: string): RelPath {
  return path.replaceAll("\\", "/") as RelPath;
}
