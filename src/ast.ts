import type { AstSelector, RelPath, Signal } from "./types.js";

/**
 * Languages available in @ast-grep/napi (not the full CLI set).
 * Keys are profile aliases; values are Lang enum member names.
 */
const LANG_ALIASES: Record<string, "Html" | "JavaScript" | "Tsx" | "Css" | "TypeScript"> = {
  html: "Html",
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JavaScript",
  tsx: "Tsx",
  css: "Css",
  typescript: "TypeScript",
  ts: "TypeScript",
};

const EXT_TO_LANG: Record<string, (typeof LANG_ALIASES)[string]> = {
  ".html": "Html",
  ".htm": "Html",
  ".js": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".jsx": "JavaScript",
  ".css": "Css",
  ".ts": "TypeScript",
  ".cts": "TypeScript",
  ".mts": "TypeScript",
  ".tsx": "Tsx",
};

const DEFAULT_INCLUDE_BY_LANG: Record<(typeof LANG_ALIASES)[string], string[]> = {
  Html: ["**/*.{html,htm}"],
  JavaScript: ["**/*.{js,jsx,mjs,cjs}"],
  Css: ["**/*.css"],
  TypeScript: ["**/*.{ts,cts,mts}"],
  Tsx: ["**/*.tsx"],
};

export function isSupportedAstLanguage(alias: string): boolean {
  return Object.prototype.hasOwnProperty.call(LANG_ALIASES, alias.toLowerCase());
}

export function resolveLang(alias: string): (typeof LANG_ALIASES)[string] | undefined {
  return LANG_ALIASES[alias.toLowerCase()];
}

export function langForPath(rel: RelPath): (typeof LANG_ALIASES)[string] | undefined {
  const lower = rel.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return undefined;
  return EXT_TO_LANG[lower.slice(dot)];
}

export function defaultIncludeForLang(canonicalLang: (typeof LANG_ALIASES)[string]): string[] {
  return DEFAULT_INCLUDE_BY_LANG[canonicalLang];
}

type AstGrepModule = typeof import("@ast-grep/napi");

let astGrepModule: AstGrepModule | undefined;

async function loadAstGrep(): Promise<AstGrepModule> {
  if (!astGrepModule) {
    astGrepModule = await import("@ast-grep/napi");
  }
  return astGrepModule;
}

export type ParsedRoot = {
  findAll(pattern: string): Array<{
    text(): string;
    range(): {
      start: { line: number; column: number };
    };
  }>;
};

/** Parse once per (file, language). Caller owns the cache map. */
export async function parseSource(args: {
  language: string;
  text: string;
}): Promise<ParsedRoot | undefined> {
  const canonical = resolveLang(args.language);
  if (!canonical) return undefined;
  try {
    const { parse, Lang } = await loadAstGrep();
    const langValue = Lang[canonical];
    const root = parse(langValue, args.text).root();
    return root;
  } catch {
    return undefined;
  }
}

export function runAstSelector(args: {
  selector: AstSelector;
  rel: RelPath;
  root: ParsedRoot;
}): Signal[] {
  const signals: Signal[] = [];
  let matches: ReturnType<ParsedRoot["findAll"]>;
  try {
    matches = args.root.findAll(args.selector.pattern);
  } catch {
    return signals;
  }
  let guard = 0;
  for (const node of matches) {
    guard += 1;
    if (guard > 500) break;
    const range = node.range();
    // ast-grep uses 0-based line/column; Signal uses 1-based like lexical.
    const line = range.start.line + 1;
    const column = range.start.column + 1;
    const evidence = node.text().slice(0, 200);
    signals.push({
      id: `${args.selector.id}:${args.rel}:${line}:${column}`,
      selectorId: args.selector.id,
      path: args.rel,
      line,
      column,
      evidence,
    });
  }
  return signals;
}
