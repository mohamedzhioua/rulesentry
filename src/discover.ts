/**
 * Zero-config discovery of AI-agent config, rules, skill and MCP files.
 *
 * With no path arguments, rulesentry walks the working directory and collects
 * only the files that an AI coding agent auto-discovers and trusts — so a
 * developer runs one command and the right things get scanned. Explicit path
 * arguments override discovery: a file passed directly is always scanned.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface DiscoverOptions {
  /** Scan every text file under directory arguments, not just agent files. */
  all?: boolean;
  /** Skip files larger than this many bytes (default 5 MiB). */
  maxBytes?: number;
}

/** Directories we never descend into. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-test",
  "build",
  "out",
  ".next",
  "target",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  ".cache",
  ".turbo",
  ".gradle",
]);

/** Exact basenames that are agent config files anywhere in the tree. */
const EXACT_BASENAMES = new Set([
  "CLAUDE.md",
  "CLAUDE.local.md",
  "AGENTS.md",
  "AGENT.md",
  "GEMINI.md",
  "CONVENTIONS.md",
  ".cursorrules",
  ".windsurfrules",
  ".clinerules",
  ".aider.conf.yml",
]);

/** Config directories under which text files are treated as agent files. */
const CONFIG_DIRS = [
  ".claude",
  ".codex",
  ".cursor/rules",
  ".windsurf/rules",
  ".clinerules",
  ".github/instructions",
];

const TEXT_EXTS = new Set([
  ".md",
  ".mdc",
  ".markdown",
  ".txt",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
  ".bash",
  ".zsh",
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".py",
  ".rb",
  ".ps1",
  "",
]);

function underDir(norm: string, dir: string): boolean {
  return norm.includes(`/${dir}/`) || norm.startsWith(`${dir}/`);
}

/** Decide whether a repo-relative path is an agent-trusted file. */
export function isAgentFile(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  const base = norm.slice(norm.lastIndexOf("/") + 1);
  const lower = base.toLowerCase();
  const ext = path.extname(base).toLowerCase();

  if (EXACT_BASENAMES.has(base)) return true;
  if (lower === "copilot-instructions.md") return true;
  if (lower === "skill.md") return true;
  if (lower.endsWith(".instructions.md")) return true;
  if (base === ".mcp.json" || base === "mcp.json" || lower.endsWith(".mcp.json")) {
    return true;
  }
  if (CONFIG_DIRS.some((d) => underDir(norm, d)) && TEXT_EXTS.has(ext)) {
    return true;
  }
  return false;
}

function isProbablyText(ext: string): boolean {
  return TEXT_EXTS.has(ext);
}

interface WalkResult {
  files: string[];
  skippedLarge: string[];
}

/** Guard against pathologically deep trees overflowing the stack. */
const MAX_DEPTH = 64;

function walk(
  root: string,
  base: string,
  opts: DiscoverOptions,
  acc: WalkResult,
  matcher: (rel: string) => boolean,
  depth = 0,
): void {
  if (depth > MAX_DEPTH) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    const rel = path.relative(base, full);
    if (entry.isSymbolicLink()) continue; // do not follow links (loop/escape safety)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, base, opts, acc, matcher, depth + 1);
    } else if (entry.isFile()) {
      if (!matcher(rel)) continue;
      try {
        const stat = fs.statSync(full);
        const max = opts.maxBytes ?? 5 * 1024 * 1024;
        if (stat.size > max) {
          acc.skippedLarge.push(rel);
          continue;
        }
      } catch {
        continue;
      }
      acc.files.push(full);
    }
  }
}

export interface Discovery {
  /** Absolute paths to scan. */
  files: string[];
  skippedLarge: string[];
}

/**
 * Resolve a set of scan targets.
 *
 * - No targets  -> discover agent files under cwd.
 * - A directory -> discover agent files under it (or every text file if `all`).
 * - A file      -> scanned directly regardless of name (the caller chose it).
 */
export function discover(
  targets: string[],
  cwd: string,
  opts: DiscoverOptions = {},
): Discovery {
  const acc: WalkResult = { files: [], skippedLarge: [] };
  const roots = targets.length > 0 ? targets : ["."];

  for (const t of roots) {
    const abs = path.resolve(cwd, t);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (stat.isFile()) {
      // Size cap applies to explicit file arguments too, so a giant file passed
      // directly cannot OOM the process.
      const max = opts.maxBytes ?? 5 * 1024 * 1024;
      if (stat.size > max) {
        acc.skippedLarge.push(path.relative(cwd, abs).replace(/\\/g, "/"));
        continue;
      }
      // Explicit file argument: always scan it.
      if (targets.length > 0) {
        acc.files.push(abs);
      } else if (isAgentFile(path.relative(cwd, abs))) {
        acc.files.push(abs);
      }
    } else if (stat.isDirectory()) {
      const matcher = opts.all
        ? (rel: string) => isProbablyText(path.extname(rel).toLowerCase())
        : isAgentFile;
      walk(abs, abs, opts, acc, matcher);
    }
  }

  // De-duplicate while preserving order.
  const seen = new Set<string>();
  const files = acc.files.filter((f) => {
    const key = path.resolve(f);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  files.sort();
  return { files, skippedLarge: acc.skippedLarge };
}
