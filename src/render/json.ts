/**
 * Machine-readable JSON output. Stable shape for scripting and dashboards.
 */

import type { Report } from "../report.js";

export function renderJson(report: Report): string {
  const out = {
    tool: "rulesentry",
    version: report.version,
    stats: report.stats,
    findings: report.files.flatMap((f) =>
      f.findings.map((finding) => ({
        rule: finding.ruleId,
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        column: finding.column,
        byteOffset: finding.byteOffset,
        byteLength: finding.byteLength,
        message: finding.message,
        ...(finding.codePoints
          ? { codePoints: finding.codePoints.map((cp) => "U+" + cp.toString(16).toUpperCase().padStart(4, "0")) }
          : {}),
        ...(finding.decoded !== undefined ? { decoded: finding.decoded } : {}),
        ...(finding.evidence !== undefined ? { evidence: finding.evidence } : {}),
      })),
    ),
    readErrors: report.files
      .filter((f) => f.error)
      .map((f) => ({ file: f.file, error: f.error })),
  };
  return JSON.stringify(out, null, 2);
}
