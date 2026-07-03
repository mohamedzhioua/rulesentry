/**
 * Core data model shared across the scanner.
 *
 * A {@link Finding} is one located problem inside one file. A {@link Report}
 * is the aggregate of every finding across a scan, plus enough metadata to
 * drive exit codes and every output format (pretty / json / sarif).
 */

import type { Receipt } from "./receipt.js";

export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** All rule identifiers rulesentry can emit. Keep in sync with {@link rules}. */
export type RuleId =
  | "RS001" // zero-width characters
  | "RS002" // bidirectional control / override characters
  | "RS003" // Unicode Tag characters (ASCII smuggling)
  | "RS004" // variation-selector data smuggling
  | "RS005" // other invisible / format characters
  | "RS006" // deceptive whitespace
  | "RS007" // disallowed control characters
  | "RS010" // homoglyph / mixed-script confusable
  | "RS020" // dynamic-context command-execution prefix
  | "RS021" // remote code execution string (curl | bash)
  | "RS022"; // obfuscated / inline code execution

/**
 * One located problem. Positions are 1-based for humans (line/column) and
 * 0-based byte offsets for machines (SARIF, editors). `byteLength` covers the
 * whole offending span so a run of hidden characters is a single region.
 */
export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  /** Path as supplied to the scanner (repo-relative when possible). */
  file: string;
  /** 1-based line of the start of the span. */
  line: number;
  /** 1-based column (in code points) of the start of the span. */
  column: number;
  /** 0-based UTF-8 byte offset of the start of the span. */
  byteOffset: number;
  /** Length of the span in UTF-8 bytes. */
  byteLength: number;
  /** Human-readable, one-line description of exactly what was found. */
  message: string;
  /** Code points involved (for the unicode family of rules). */
  codePoints?: number[];
  /**
   * For smuggling rules (RS003/RS004): the ASCII/text the hidden bytes decode
   * to — i.e. what the agent actually reads. This is the money shot.
   */
  decoded?: string;
  /** The literal matched substring for the exec-string rules. */
  evidence?: string;
  /** The agent instruction surface this finding's file belongs to. */
  surface?: string;
}

export interface FileReport {
  file: string;
  findings: Finding[];
  /** True when the file could not be read (permission, binary, gone). */
  error?: string;
  /** Load-boundary receipt (present for successfully-read files). */
  receipt?: Receipt;
}

export interface ScanStats {
  filesScanned: number;
  filesWithFindings: number;
  bySeverity: Record<Severity, number>;
  totalFindings: number;
}

export interface Report {
  files: FileReport[];
  stats: ScanStats;
  /** rulesentry version that produced this report. */
  version: string;
}

/** Order findings for display: worst severity first, then position. */
export function compareFindings(a: Finding, b: Finding): number {
  const sev = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
  if (sev !== 0) return sev;
  if (a.line !== b.line) return a.line - b.line;
  return a.column - b.column;
}

/** Roll a flat list of file reports into aggregate stats. */
export function summarize(files: FileReport[], version: string): Report {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  let total = 0;
  let filesWithFindings = 0;
  for (const f of files) {
    if (f.findings.length > 0) filesWithFindings++;
    for (const finding of f.findings) {
      bySeverity[finding.severity]++;
      total++;
    }
  }
  return {
    files,
    version,
    stats: {
      filesScanned: files.length,
      filesWithFindings,
      bySeverity,
      totalFindings: total,
    },
  };
}

/**
 * Does the report contain a finding at or above `threshold`? Drives the CLI
 * exit code so CI fails only on what the caller cares about.
 */
export function hasFindingAtOrAbove(report: Report, threshold: Severity): boolean {
  const min = SEVERITY_ORDER[threshold];
  return (Object.keys(report.stats.bySeverity) as Severity[]).some(
    (s) => SEVERITY_ORDER[s] >= min && report.stats.bySeverity[s] > 0,
  );
}
