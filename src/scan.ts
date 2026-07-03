/**
 * Scan orchestrator: discover -> read -> detect -> aggregate.
 *
 * Kept deliberately thin. It owns file I/O and turning raw findings into a
 * {@link Report}; all detection lives in {@link scanContent} and discovery in
 * {@link discover}. Paths in the report are made relative to `cwd` so output
 * is stable and portable across machines.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { discover, surfaceOf, type DiscoverOptions } from "./discover.js";
import { scanContent, type ScanOptions } from "./detect.js";
import { buildReceipt } from "./receipt.js";
import {
  compareFindings,
  summarize,
  type FileReport,
  type Report,
} from "./report.js";
import { VERSION } from "./version.js";

export interface RunOptions extends ScanOptions, DiscoverOptions {
  cwd?: string;
}

export interface RunResult {
  report: Report;
  skippedLarge: string[];
}

/** Read a file as UTF-8 text, or return null if it looks binary / unreadable. */
export function readTextFile(abs: string): { text: string } | { error: string } {
  try {
    const buf = fs.readFileSync(abs);
    // Treat a NUL byte in the first 8 KiB as a binary signal and skip.
    if (buf.subarray(0, 8192).includes(0)) {
      return { error: "skipped: looks binary (NUL byte found)" };
    }
    // toString can throw on very large buffers (>~512 MiB string limit); keep
    // it inside the try so it degrades to a reported error, not a crash.
    return { text: buf.toString("utf8") };
  } catch (e) {
    return { error: `could not read: ${(e as Error).message}` };
  }
}

export function run(targets: string[], options: RunOptions = {}): RunResult {
  const cwd = options.cwd ?? process.cwd();
  const { files, skippedLarge } = discover(targets, cwd, {
    all: options.all ?? false,
    maxBytes: options.maxBytes ?? 5 * 1024 * 1024,
  });

  const fileReports: FileReport[] = [];
  for (const abs of files) {
    const rel = toRel(cwd, abs);
    const read = readTextFile(abs);
    if ("error" in read) {
      // A binary/unreadable file is reported without findings, not fatal.
      fileReports.push({ file: rel, findings: [], error: read.error });
      continue;
    }
    const surface = surfaceOf(rel);
    const findings = scanContent(read.text, rel, {
      ...(options.disabledRules ? { disabledRules: options.disabledRules } : {}),
      homoglyph: options.homoglyph !== false,
    }).sort(compareFindings);
    for (const f of findings) f.surface = surface;
    fileReports.push({
      file: rel,
      findings,
      receipt: buildReceipt(read.text, rel),
    });
  }

  return {
    report: summarize(fileReports, VERSION),
    skippedLarge: skippedLarge.map((f) => f),
  };
}

function toRel(cwd: string, abs: string): string {
  const rel = path.relative(cwd, abs);
  // Keep forward slashes for stable, portable output.
  return (rel === "" ? path.basename(abs) : rel).replace(/\\/g, "/");
}
