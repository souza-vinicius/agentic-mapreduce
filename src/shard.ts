import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { asRelPath, type LexicalSelector, type RelPath, type ScanProfile, type Signal } from "./types.js";

const DEFAULT_INCLUDE = [
  "**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,rb,java,kt,cs,php,swift,dart,ex,exs,c,cc,cpp,h,hpp,sql,yml,yaml,json,toml}",
];

const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.amr/**",
  "**/vendor/**",
  "**/target/**",
  "**/*.min.js",
  "**/*.lock",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
];

function globToRegExp(glob: string): RegExp {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        out += "\\{";
      } else {
        const inner = glob.slice(i + 1, end);
        out += `(?:${inner.split(",").map(escapeRegex).join("|")})`;
        i = end;
      }
    } else if ("\\.[]()+^$|".includes(c ?? "")) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  out += "$";
  return new RegExp(out);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAny(rel: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(rel));
}

async function walkFiles(root: string): Promise<RelPath[]> {
  const out: RelPath[] = [];

  async function walk(absDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = asRelPath(path.relative(root, abs));
      if (entry.isDirectory()) {
        if (matchesAny(rel + "/", DEFAULT_EXCLUDE) || matchesAny(rel, DEFAULT_EXCLUDE)) {
          continue;
        }
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
          continue;
        }
        await walk(abs);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }

  await walk(root);
  return out;
}

function fileMatchesSelector(rel: RelPath, selector: LexicalSelector): boolean {
  const include = selector.include ?? DEFAULT_INCLUDE;
  const exclude = [...DEFAULT_EXCLUDE, ...(selector.exclude ?? [])];
  if (matchesAny(rel, exclude)) return false;
  return matchesAny(rel, include);
}

function runLexical(selector: LexicalSelector, rel: RelPath, text: string): Signal[] {
  const flags = selector.flags ?? "gm";
  const re = new RegExp(selector.pattern, flags.includes("g") ? flags : `${flags}g`);
  const signals: Signal[] = [];
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = re.exec(text)) !== null) {
    guard += 1;
    if (guard > 500) break;
    const index = match.index;
    const before = text.slice(0, index);
    const line = before.split("\n").length;
    const lastNl = before.lastIndexOf("\n");
    const column = index - lastNl;
    const evidence = match[0].slice(0, 200);
    signals.push({
      id: `${selector.id}:${rel}:${line}:${column}`,
      selectorId: selector.id,
      path: rel,
      line,
      column,
      evidence,
    });
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return signals;
}

export type ShardResult = {
  signals: Signal[];
  fileCountScanned: number;
  fileCountMatched: number;
  droppedFileCount: number;
};

export async function runShard(args: {
  repoRoot: string;
  profile: ScanProfile;
  onlyPaths?: RelPath[];
}): Promise<ShardResult> {
  const root = path.resolve(args.repoRoot);
  const st = await stat(root);
  if (!st.isDirectory()) {
    throw new Error(`repoRoot is not a directory: ${root}`);
  }

  const files = args.onlyPaths ?? (await walkFiles(root));
  const signals: Signal[] = [];
  const matched = new Set<string>();

  for (const rel of files) {
    let text: string;
    try {
      const abs = path.join(root, rel);
      const fileStat = await stat(abs);
      if (fileStat.size > 1_500_000) continue;
      text = await readFile(abs, "utf8");
    } catch {
      continue;
    }

    let hit = false;
    for (const selector of args.profile.selectors) {
      if (selector.kind !== "lexical") continue;
      if (!fileMatchesSelector(rel, selector)) continue;
      const found = runLexical(selector, rel, text);
      if (found.length > 0) {
        hit = true;
        signals.push(...found);
      }
    }
    if (hit) matched.add(rel);
  }

  return {
    signals,
    fileCountScanned: files.length,
    fileCountMatched: matched.size,
    droppedFileCount: files.length - matched.size,
  };
}
