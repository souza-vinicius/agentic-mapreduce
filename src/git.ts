import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { asRelPath, type RelPath } from "./types.js";

const execFileAsync = promisify(execFile);

export async function changedFilesSince(args: {
  repoRoot: string;
  sinceCommit: string;
}): Promise<RelPath[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${args.sinceCommit}...HEAD`],
    { cwd: args.repoRoot, maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(asRelPath);
}

export async function currentCommit(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return null;
  }
}
