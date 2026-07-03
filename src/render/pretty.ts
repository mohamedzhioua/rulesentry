/**
 * Human terminal output. Quiet by default (the zizmor formula): a clean scan
 * prints one short line; a dirty scan prints, per finding, the location and the
 * "what you see vs. what the agent reads" reveal that makes the threat obvious.
 */

import type { Finding, Report, Severity } from "../report.js";
import { revealText, sanitizeForTerminal } from "../reveal.js";

interface PrettyOptions {
  color: boolean;
  /** file path -> full source text, for building reveal snippets. */
  sources: Map<string, string>;
  /** Include RS006/low deceptive-space noise inline (default true). */
}

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
};

function sevColor(s: Severity): string {
  switch (s) {
    case "critical":
      return COLORS.red;
    case "high":
      return COLORS.magenta;
    case "medium":
      return COLORS.yellow;
    case "low":
      return COLORS.blue;
  }
}

export function renderPretty(report: Report, opts: PrettyOptions): string {
  const c = (code: string, text: string) =>
    opts.color ? `${code}${text}${COLORS.reset}` : text;

  const lines: string[] = [];
  const filesWithFindings = report.files.filter((f) => f.findings.length > 0);
  const readErrors = report.files.filter((f) => f.error);

  if (report.stats.totalFindings === 0) {
    lines.push(
      c(
        COLORS.green,
        `✓ rulesentry: no hidden instructions found`,
      ) +
        c(
          COLORS.gray,
          ` (${report.stats.filesScanned} file${
            report.stats.filesScanned === 1 ? "" : "s"
          } scanned)`,
        ),
    );
    return lines.join("\n");
  }

  for (const file of filesWithFindings) {
    lines.push(c(COLORS.bold, file.file));
    const source = opts.sources.get(file.file);
    // Split the source once per file, not once per finding (avoids O(n²) on a
    // file that produces many findings on the same line).
    const sourceLines = source !== undefined ? source.split(/\r?\n/) : undefined;
    for (const finding of file.findings) {
      lines.push(renderFinding(finding, sourceLines, c));
    }
    lines.push("");
  }

  if (readErrors.length > 0) {
    for (const f of readErrors) {
      lines.push(c(COLORS.gray, `  ~ ${f.file}: ${f.error}`));
    }
    lines.push("");
  }

  lines.push(renderSummary(report, c));
  return lines.join("\n");
}

function renderFinding(
  finding: Finding,
  sourceLines: string[] | undefined,
  c: (code: string, text: string) => string,
): string {
  const parts: string[] = [];
  const sevTag = c(sevColor(finding.severity), finding.severity.toUpperCase().padEnd(8));
  const loc = c(COLORS.gray, `line ${finding.line}:${finding.column}`);
  // finding.message is derived from scanned (hostile) content — sanitize before
  // it ever reaches the terminal.
  parts.push(
    `  ${c(COLORS.dim, "✖")} ${c(COLORS.cyan, finding.ruleId)} ${sevTag} ${loc}  ${sanitizeForTerminal(finding.message)}`,
  );

  const lineText = sourceLines ? sourceLines[finding.line - 1] : undefined;
  if (lineText !== undefined && lineText.trim() !== "") {
    const revealed = revealText(lineText, finding.ruleId === "RS010");
    if (revealed !== lineText) {
      parts.push(
        `      ${c(COLORS.gray, "you see:  ")}${c(COLORS.dim, sanitizeForTerminal(collapse(lineText)))}`,
      );
      parts.push(
        `      ${c(COLORS.gray, "agent reads:")}${" "}${highlightMarkers(collapse(revealed), c)}`,
      );
    }
  }
  if (finding.decoded) {
    // JSON.stringify escapes control chars, so this is terminal-safe.
    parts.push(
      `      ${c(COLORS.gray, "decoded →")} ${c(COLORS.red, JSON.stringify(finding.decoded))}`,
    );
  }
  if (finding.evidence) {
    parts.push(`      ${c(COLORS.gray, "match →")} ${c(COLORS.dim, sanitizeForTerminal(finding.evidence))}`);
  }
  parts.push(
    c(COLORS.gray, `      byte offset ${finding.byteOffset}, length ${finding.byteLength} · rulesentry explain ${finding.ruleId}`),
  );
  return parts.join("\n");
}

function highlightMarkers(
  text: string,
  c: (code: string, text: string) => string,
): string {
  // Colour the ⟦…⟧ / ⟪…⟫ reveal markers so they pop against normal text.
  return text.replace(/(⟦[^⟧]*⟧|⟪[^⟫]*⟫)/g, (m) => c(COLORS.red, m));
}

function renderSummary(
  report: Report,
  c: (code: string, text: string) => string,
): string {
  const s = report.stats;
  const bits: string[] = [];
  const order: Severity[] = ["critical", "high", "medium", "low"];
  for (const sev of order) {
    if (s.bySeverity[sev] > 0) {
      bits.push(c(sevColor(sev), `${s.bySeverity[sev]} ${sev}`));
    }
  }
  return (
    c(COLORS.bold, `${s.totalFindings} finding${s.totalFindings === 1 ? "" : "s"}`) +
    ` (${bits.join(", ")}) in ${s.filesWithFindings} of ${s.filesScanned} file${
      s.filesScanned === 1 ? "" : "s"
    }`
  );
}

function collapse(s: string): string {
  // Keep the line readable in a terminal; trim very long lines.
  const trimmed = s.replace(/\t/g, "  ");
  return trimmed.length > 160 ? trimmed.slice(0, 159) + "…" : trimmed;
}
