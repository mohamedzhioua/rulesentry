/**
 * The opt-in normalizer behind `rulesentry fix`.
 *
 * It rewrites files into their {@link safeCanonical} form — removing the
 * unambiguously-invisible characters and normalizing deceptive whitespace — and
 * NOTHING else. Homoglyphs and executable strings (RS010/RS020/RS021/RS022) are
 * intent-dependent, so they are never auto-rewritten; the result reports how
 * many such findings still need human review.
 *
 * By default it is a dry run (reports what would change, exits non-zero if
 * anything is pending) so it is safe in CI; `write: true` applies the changes.
 * Either way it emits the before/after git blob hash for a reviewable trail.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { discover, surfaceOf, type Surface } from "./discover.js";
import { readTextFile } from "./scan.js";
import { safeCanonical } from "./canonical.js";
import { classify } from "./unicode.js";
import { scanContent } from "./detect.js";
import { gitBlobSha1 } from "./receipt.js";
import type { RuleId } from "./report.js";

/** Rules whose findings the fixer resolves; everything else is human-review. */
const FIXABLE_RULES = new Set<RuleId>([
  "RS001",
  "RS002",
  "RS003",
  "RS004",
  "RS005",
  "RS006",
  "RS007",
]);

const STRIP_CATEGORIES = new Set([
  "zero-width",
  "tag",
  "variation-selector",
  "bidi",
  "invisible",
  "control",
]);

export interface FixFileResult {
  file: string;
  surface: Surface;
  changed: boolean;
  applied: boolean;
  /** Count of code points removed or normalized. */
  neutralized: number;
  beforeBlob: string;
  afterBlob: string;
  /** Findings left that need human review (homoglyph / executable strings). */
  reviewNeeded: number;
  error?: string;
}

export interface FixResult {
  files: FixFileResult[];
  /** True if any file changed (whether or not it was written). */
  anyChanged: boolean;
}

export interface FixOptions {
  cwd?: string;
  /** Actually write the canonical form back to disk. */
  write?: boolean;
  all?: boolean;
  maxBytes?: number;
}

/** Count the code points a safe-canonicalization would remove or normalize. */
function countNeutralized(content: string): number {
  let n = 0;
  let first = true;
  for (const ch of content) {
    const cp = ch.codePointAt(0)!;
    if (first) {
      first = false;
      if (cp === 0xfeff) continue; // preserved leading BOM
    }
    const info = classify(cp);
    if (info && (STRIP_CATEGORIES.has(info.category) || info.category === "deceptive-space")) {
      n++;
    }
  }
  return n;
}

export function fix(targets: string[], options: FixOptions = {}): FixResult {
  const cwd = options.cwd ?? process.cwd();
  const { files } = discover(targets, cwd, {
    all: options.all ?? false,
    maxBytes: options.maxBytes ?? 5 * 1024 * 1024,
  });

  const results: FixFileResult[] = [];
  let anyChanged = false;

  for (const abs of files) {
    const rel = path.relative(cwd, abs).replace(/\\/g, "/") || path.basename(abs);
    const read = readTextFile(abs);
    if ("error" in read) {
      results.push({
        file: rel,
        surface: surfaceOf(rel),
        changed: false,
        applied: false,
        neutralized: 0,
        beforeBlob: "",
        afterBlob: "",
        reviewNeeded: 0,
        error: read.error,
      });
      continue;
    }

    const before = read.text;
    const after = safeCanonical(before);
    const changed = after !== before;
    const reviewNeeded = scanContent(after, rel).filter(
      (f) => !FIXABLE_RULES.has(f.ruleId),
    ).length;

    let applied = false;
    if (changed && options.write) {
      try {
        fs.writeFileSync(abs, after);
        applied = true;
      } catch (e) {
        results.push({
          file: rel,
          surface: surfaceOf(rel),
          changed,
          applied: false,
          neutralized: countNeutralized(before),
          beforeBlob: gitBlobSha1(before),
          afterBlob: gitBlobSha1(after),
          reviewNeeded,
          error: `could not write: ${(e as Error).message}`,
        });
        anyChanged = true;
        continue;
      }
    }
    if (changed) anyChanged = true;

    results.push({
      file: rel,
      surface: surfaceOf(rel),
      changed,
      applied,
      neutralized: countNeutralized(before),
      beforeBlob: gitBlobSha1(before),
      afterBlob: gitBlobSha1(after),
      reviewNeeded,
    });
  }

  return { files: results, anyChanged };
}
