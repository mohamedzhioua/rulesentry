/**
 * The rule catalog. One entry per {@link RuleId} — the single source of truth
 * for `rulesentry explain`, SARIF rule metadata, and the docs table.
 */

import type { RuleId, Severity } from "./report.js";

export interface RuleDoc {
  id: RuleId;
  title: string;
  defaultSeverity: Severity;
  /** One-paragraph description of the threat. */
  description: string;
  /** What to do about it. */
  remediation: string;
  /** External references (MITRE ATLAS, advisories). */
  references: string[];
}

export const RULES: Record<RuleId, RuleDoc> = {
  RS001: {
    id: "RS001",
    title: "Zero-width / invisible character",
    defaultSeverity: "high",
    description:
      "Zero-width characters (ZERO WIDTH SPACE/JOINER/NON-JOINER, WORD JOINER, BOM, invisible math operators) occupy no visual space but are still read by the agent. Attackers hide instructions inside otherwise-normal text so a human reviewer approves a file that tells the agent something else.",
    remediation:
      "Remove the characters. If they are genuinely needed (rare in config/skill files), pin the exact code points and suppress with a documented reason.",
    references: [
      "MITRE ATLAS AML-CS0041 (Rules-File Backdoor)",
      "Pillar Security: New vulnerability in GitHub Copilot and Cursor",
    ],
  },
  RS002: {
    id: "RS002",
    title: "Bidirectional control / override character",
    defaultSeverity: "high",
    description:
      "Bidi controls (RIGHT-TO-LEFT OVERRIDE, isolates, embeddings) reorder how text is displayed without changing the logical byte order the agent reads. This is the 'Trojan Source' class: the rendered line and the ingested line differ.",
    remediation:
      "Remove bidi controls from config and skill files. Legitimate right-to-left content should not appear in agent instruction files.",
    references: [
      "Trojan Source (CVE-2021-42574)",
      "MITRE ATLAS AML-CS0041",
    ],
  },
  RS003: {
    id: "RS003",
    title: "Unicode Tag character (ASCII smuggling)",
    defaultSeverity: "critical",
    description:
      "Unicode Tag characters (U+E0000–U+E007F) mirror ASCII but render as nothing. A run of them encodes a complete hidden message that is invisible to humans yet plain text to the agent — a direct instruction-smuggling channel. rulesentry decodes the payload for you.",
    remediation:
      "Delete the tag characters. There is no legitimate use of Tag characters in agent configuration or skill files.",
    references: [
      "MITRE ATLAS AML-CS0041",
      "Unicode Technical Standard #55 (Source Code Handling)",
    ],
  },
  RS004: {
    id: "RS004",
    title: "Variation-selector data smuggling",
    defaultSeverity: "high",
    description:
      "Variation selectors (U+FE00–FE0F, U+E0100–E01EF) select glyph variants and normally follow a base character. A long run with no base carries an arbitrary byte channel — a documented technique for smuggling hidden data/instructions past human review. rulesentry decodes the run.",
    remediation:
      "Remove the variation-selector run. A single selector after an emoji is normal; multi-character runs on their own are not.",
    references: ["Paul Butler: Smuggling arbitrary data through emoji"],
  },
  RS005: {
    id: "RS005",
    title: "Other invisible / format character",
    defaultSeverity: "medium",
    description:
      "Soft hyphen, combining grapheme joiner, Hangul/Khmer fillers, braille blank, and interlinear-annotation controls render invisibly or as blanks and can be used to hide or fragment text the agent reads.",
    remediation: "Remove the character unless there is a documented linguistic need.",
    references: ["MITRE ATLAS AML-CS0041"],
  },
  RS006: {
    id: "RS006",
    title: "Deceptive whitespace",
    defaultSeverity: "low",
    description:
      "No-break space, narrow/hair spaces, ideographic space and friends render like an ordinary space but are distinct code points. They can defeat naive string comparisons and hide token boundaries.",
    remediation:
      "Normalize to ordinary spaces (U+0020) unless the character is intentional (e.g. NBSP in prose).",
    references: [],
  },
  RS007: {
    id: "RS007",
    title: "Disallowed control character",
    defaultSeverity: "high",
    description:
      "C0/C1 control characters (other than tab, newline, carriage return) do not belong in text config or skill files and can corrupt or hide content when rendered.",
    remediation: "Remove the control character.",
    references: [],
  },
  RS010: {
    id: "RS010",
    title: "Homoglyph / mixed-script confusable",
    defaultSeverity: "medium",
    description:
      "A token mixes ASCII letters with non-ASCII look-alikes (e.g. Cyrillic 'а' for Latin 'a'). The word reads normally to a human but is a different string to the agent — used to spoof commands, tool names, paths, or allow-list entries.",
    remediation:
      "Replace the confusable characters with their ASCII equivalents, or confirm the token is genuinely non-Latin and suppress.",
    references: ["Unicode Technical Standard #39 (Security Mechanisms)"],
  },
  RS020: {
    id: "RS020",
    title: "Dynamic-context command-execution prefix",
    defaultSeverity: "high",
    description:
      "In Claude Code skills and slash-command files, a bang immediately before a backtick code span (!`command`) is executed and its output is spliced into the prompt before the model reads the file. Untrusted or malicious commands here run automatically as dynamic context.",
    remediation:
      "Confirm the command is trusted and gated by an explicit `allowed-tools` frontmatter entry. Never accept !`...` blocks from untrusted contributors or generated files.",
    references: [
      "Claude Code docs: Extend Claude with skills — Inject dynamic context",
      "Datadog: Malicious skills — supply-chain risks in coding agents",
    ],
  },
  RS021: {
    id: "RS021",
    title: "Remote code execution string (curl | bash)",
    defaultSeverity: "high",
    description:
      "A download-and-pipe-to-shell command (curl/wget/fetch … | bash) inside an agent-consumed file executes attacker-controlled remote code if the agent runs it. Common exfiltration and implant vector.",
    remediation:
      "Remove the piped execution. Fetch, review, and run scripts as explicit, pinned steps instead.",
    references: [
      "Datadog: Malicious skills — supply-chain risks in coding agents",
    ],
  },
  RS022: {
    id: "RS022",
    title: "Obfuscated / inline code execution",
    defaultSeverity: "medium",
    description:
      "base64-decode-to-shell pipelines and inline interpreter one-liners (eval, python -c, node -e, Invoke-Expression) hide the actual payload from review. Their presence in agent config or skill files is a strong obfuscation signal.",
    remediation:
      "Replace obfuscated execution with explicit, reviewable commands. Decode and inspect any base64 payload.",
    references: [],
  },
};

export function ruleList(): RuleDoc[] {
  return Object.values(RULES);
}
