/**
 * SARIF 2.1.0 output for GitHub code scanning and other SARIF consumers.
 *
 * Every rulesentry rule is emitted as a reporting descriptor with a
 * `security-severity` score so GitHub renders severity correctly, and each
 * finding becomes a result anchored to line/column plus byte offset.
 */

import type { Finding, Report, Severity } from "../report.js";
import { RULES } from "../rules.js";

const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
};

const SECURITY_SEVERITY: Record<Severity, string> = {
  critical: "9.5",
  high: "8.0",
  medium: "5.0",
  low: "3.0",
};

const INFO_URI = "https://github.com/mohamedzhioua/rulesentry";

export function renderSarif(report: Report): string {
  const usedRuleIds = new Set<string>();
  for (const f of report.files) {
    for (const finding of f.findings) usedRuleIds.add(finding.ruleId);
  }

  const rules = Object.values(RULES)
    .filter((r) => usedRuleIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: pascalName(r.title),
      shortDescription: { text: r.title },
      fullDescription: { text: r.description },
      helpUri: `${INFO_URI}#${r.id.toLowerCase()}`,
      help: {
        text: `${r.description}\n\nRemediation: ${r.remediation}`,
      },
      defaultConfiguration: { level: SARIF_LEVEL[r.defaultSeverity] },
      properties: {
        tags: ["security", "ai-agent", "prompt-injection"],
        "security-severity": SECURITY_SEVERITY[r.defaultSeverity],
      },
    }));

  const ruleIndex = new Map<string, number>();
  rules.forEach((r, i) => ruleIndex.set(r.id, i));

  const results = report.files.flatMap((f) =>
    f.findings.map((finding) => toResult(finding, ruleIndex)),
  );

  const sarif = {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "rulesentry",
            informationUri: INFO_URI,
            version: report.version,
            rules,
          },
        },
        results,
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

function toResult(finding: Finding, ruleIndex: Map<string, number>) {
  const region: Record<string, number> = {
    startLine: finding.line,
    startColumn: finding.column,
    byteOffset: finding.byteOffset,
    byteLength: finding.byteLength,
  };
  return {
    ruleId: finding.ruleId,
    ruleIndex: ruleIndex.get(finding.ruleId) ?? 0,
    level: SARIF_LEVEL[finding.severity],
    message: { text: finding.decoded ? `${finding.message} [decoded: ${JSON.stringify(finding.decoded)}]` : finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.file },
          region,
        },
      },
    ],
    partialFingerprints: {
      rulesentryFingerprint: `${finding.ruleId}:${finding.file}:${finding.byteOffset}`,
    },
    ...(finding.surface ? { properties: { surface: finding.surface } } : {}),
  };
}

function pascalName(title: string): string {
  return title
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
}
