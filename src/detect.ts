/**
 * The scan engine: turn one file's text into {@link Finding}s.
 *
 * Everything is anchored to precise positions. We tokenize the content once
 * into a code-point array that carries, for every code point, its UTF-16 index
 * (what a JS regex reports), its UTF-8 byte offset (what editors and SARIF
 * want), and its 1-based line/column. Every detector then reports against that
 * single source of truth, so a byte offset is never guessed.
 */

import {
  classify,
  decodeTagRun,
  decodeVariationRun,
  hex,
  type UnicodeCategory,
} from "./unicode.js";
import { confusableToAscii, isAsciiAlnum } from "./confusables.js";
import type { Finding, RuleId, Severity } from "./report.js";

export interface ScanOptions {
  /** Rule ids to skip entirely. */
  disabledRules?: Set<RuleId>;
  /** Disable the higher-false-positive homoglyph rule (RS010). Default: on. */
  homoglyph?: boolean;
}

interface Cp {
  cp: number;
  /** UTF-16 code-unit index of this code point's first unit. */
  u16: number;
  /** UTF-8 byte offset of this code point. */
  byte: number;
  /** UTF-8 byte length of this code point. */
  byteLen: number;
  /** 1-based line. */
  line: number;
  /** 1-based column (code points). */
  col: number;
}

function utf8Len(cp: number): number {
  if (cp <= 0x7f) return 1;
  if (cp <= 0x7ff) return 2;
  if (cp <= 0xffff) return 3;
  return 4;
}

/** Tokenize content into a positioned code-point array (single O(n) pass). */
export function tokenize(content: string): Cp[] {
  const out: Cp[] = [];
  let byte = 0;
  let line = 1;
  let col = 1;
  let u16 = 0;
  for (const ch of content) {
    const cp = ch.codePointAt(0)!;
    out.push({ cp, u16, byte, byteLen: utf8Len(cp), line, col });
    byte += utf8Len(cp);
    u16 += ch.length; // 1 for BMP, 2 for astral (surrogate pair)
    if (cp === 0x0a) {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return out;
}

/** Total UTF-8 byte length represented by a code-point array. */
function totalBytes(cps: Cp[]): number {
  const last = cps[cps.length - 1];
  return last ? last.byte + last.byteLen : 0;
}

/** Find the Cp whose u16 index is `idx` (binary search; cps sorted by u16). */
function cpAtU16(cps: Cp[], idx: number): Cp | undefined {
  let lo = 0;
  let hi = cps.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cps[mid]!;
    if (c.u16 === idx) return c;
    if (c.u16 < idx) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/**
 * Scan one file's content. `file` is used only to label findings.
 */
export function scanContent(
  content: string,
  file: string,
  options: ScanOptions = {},
): Finding[] {
  const disabled = options.disabledRules ?? new Set<RuleId>();
  const homoglyphOn = options.homoglyph !== false;
  const cps = tokenize(content);
  const findings: Finding[] = [];

  detectUnicodeRuns(cps, file, findings, disabled);
  if (homoglyphOn && !disabled.has("RS010")) {
    detectHomoglyphs(cps, file, findings);
  }
  detectRegexRules(content, cps, file, findings, disabled);

  return findings;
}

// --------------------------------------------------------------------------
// RS001–RS007: runs of suspicious code points
// --------------------------------------------------------------------------

/**
 * Cap the amount of attacker data we retain / emit per finding. A 5 MiB file of
 * pure tag characters would otherwise produce a multi-megabyte message and
 * codePoints array; the true count is still reported, only the retained detail
 * is bounded.
 */
const MAX_RUN_ITEMS = 4096;

interface Run {
  category: UnicodeCategory;
  first: Cp;
  last: Cp;
  count: number;
  items: Cp[];
  names: string[];
}

function detectUnicodeRuns(
  cps: Cp[],
  file: string,
  findings: Finding[],
  disabled: Set<RuleId>,
): void {
  let run: Run | null = null;

  const flush = () => {
    if (!run) return;
    const r = run;
    run = null;
    emitUnicodeFinding(r, file, findings, disabled);
  };

  for (const c of cps) {
    const info = classify(c.cp);
    if (info) {
      if (run && run.category === info.category) {
        run.count++;
        run.last = c;
        if (run.items.length < MAX_RUN_ITEMS) {
          run.items.push(c);
          run.names.push(info.name);
        }
      } else {
        flush();
        run = {
          category: info.category,
          first: c,
          last: c,
          count: 1,
          items: [c],
          names: [info.name],
        };
      }
    } else {
      flush();
    }
  }
  flush();
}

function emitUnicodeFinding(
  run: Run,
  file: string,
  findings: Finding[],
  disabled: Set<RuleId>,
): void {
  const { category, first, last, items, names } = run;
  const runCount = run.count;
  const codePoints = items.map((i) => i.cp);

  // A single leading BOM (U+FEFF at byte 0) is conventional and benign.
  if (
    category === "zero-width" &&
    runCount === 1 &&
    first.cp === 0xfeff &&
    first.byte === 0
  ) {
    return;
  }

  const info = classify(first.cp)!;
  const ruleId = info.rule;
  if (disabled.has(ruleId)) return;

  let severity: Severity = info.severity;
  let decoded: string | undefined;
  let message: string;
  const uniqueNames = [...new Set(names)];
  const shown = (d: string) => truncate(d, 120);

  switch (category) {
    case "tag": {
      decoded = decodeTagRun(codePoints);
      severity = "critical";
      message = decoded
        ? `${runCount} Unicode Tag character(s) smuggling hidden text: "${shown(decoded)}" — invisible to a human reviewer, read by the agent`
        : `${runCount} Unicode Tag character(s) (invisible ASCII smuggling channel)`;
      break;
    }
    case "variation-selector": {
      if (runCount === 1) {
        // A lone variation selector is usually a legitimate emoji/glyph
        // presentation selector; flag quietly rather than screaming.
        severity = "low";
        message = `Variation selector ${uniqueNames[0]}`;
      } else {
        const vs = decodeVariationRun(codePoints);
        decoded = vs.decoded;
        severity = vs.kind === "text" ? "critical" : "high";
        message =
          vs.kind === "text"
            ? `${runCount} variation selectors smuggling hidden data: "${shown(vs.decoded)}" (byte channel)`
            : `${runCount} variation selectors forming a hidden byte channel (${shown(vs.decoded)})`;
      }
      break;
    }
    case "bidi": {
      const hasOverride = codePoints.some(
        (cp) => cp === 0x202d || cp === 0x202e,
      );
      severity = hasOverride ? "high" : "medium";
      message = `${runCount} bidirectional control character(s) [${uniqueNames.join(
        ", ",
      )}] — can reorder how text renders vs. how it is read`;
      break;
    }
    case "zero-width": {
      severity = "high";
      message = `${runCount} zero-width / invisible character(s) [${uniqueNames.join(
        ", ",
      )}] hidden in text`;
      break;
    }
    case "invisible": {
      severity = "medium";
      message = `${runCount} invisible/format character(s) [${uniqueNames.join(
        ", ",
      )}]`;
      break;
    }
    case "deceptive-space": {
      severity = "low";
      message = `${runCount} deceptive whitespace character(s) [${uniqueNames.join(
        ", ",
      )}] that render like a normal space`;
      break;
    }
    case "control": {
      severity = "high";
      message = `${runCount} disallowed control character(s) [${uniqueNames.join(
        ", ",
      )}]`;
      break;
    }
    default: {
      message = `${runCount} suspicious character(s)`;
    }
  }

  const byteLength =
    last.byte + last.byteLen - first.byte === 0
      ? 1
      : last.byte + last.byteLen - first.byte;

  const finding: Finding = {
    ruleId,
    severity,
    file,
    line: first.line,
    column: first.col,
    byteOffset: first.byte,
    byteLength,
    message,
    codePoints,
  };
  if (decoded) finding.decoded = decoded;
  findings.push(finding);
}

// --------------------------------------------------------------------------
// RS010: homoglyph / mixed-script confusable tokens
// --------------------------------------------------------------------------

function detectHomoglyphs(cps: Cp[], file: string, findings: Finding[]): void {
  let token: Cp[] = [];

  const flush = () => {
    if (token.length === 0) return;
    const t = token;
    token = [];
    const hasAscii = t.some((c) => isAsciiAlnum(c.cp));
    const confusables = t.filter((c) => confusableToAscii(c.cp) !== null);
    // Fire only on genuine mixed-script spoofing: ASCII letters AND at least
    // one confusable in the same token. Pure foreign-script words never match.
    if (!hasAscii || confusables.length === 0) return;
    const first = t[0]!;
    const last = t[t.length - 1]!;
    const looksLike = truncate(
      t.map((c) => confusableToAscii(c.cp) ?? String.fromCodePoint(c.cp)).join(""),
      120,
    );
    const detail = confusables
      .slice(0, 20)
      .map((c) => `U+${hex(c.cp)}→'${confusableToAscii(c.cp)}'`)
      .join(", ");
    findings.push({
      ruleId: "RS010",
      severity: "medium",
      file,
      line: first.line,
      column: first.col,
      byteOffset: first.byte,
      byteLength: Math.max(1, last.byte + last.byteLen - first.byte),
      message: `Mixed-script token disguised as "${looksLike}" using non-ASCII look-alikes [${detail}${
        confusables.length > 20 ? ", …" : ""
      }]`,
      codePoints: t.slice(0, MAX_RUN_ITEMS).map((c) => c.cp),
    });
  };

  for (const c of cps) {
    const isTokenChar =
      isAsciiAlnum(c.cp) ||
      confusableToAscii(c.cp) !== null ||
      // include letters generally so a Cyrillic word stays one token and does
      // not falsely split into confusable-only fragments
      /\p{L}/u.test(String.fromCodePoint(c.cp));
    if (isTokenChar) {
      token.push(c);
    } else {
      flush();
    }
  }
  flush();
}

// --------------------------------------------------------------------------
// RS020–RS022: regex-driven rules over raw text
// --------------------------------------------------------------------------

interface RegexRule {
  ruleId: RuleId;
  severity: Severity;
  regex: RegExp;
  describe: (m: RegExpExecArray) => string;
}

const REGEX_RULES: RegexRule[] = [
  {
    // `` !`command` `` — Claude Code dynamic-context bash injection. The bang
    // immediately before a backtick code span is executed and its output is
    // spliced in before the model reads the file (skills / slash commands).
    ruleId: "RS020",
    severity: "high",
    regex: /!`([^`\n]{1,400})`/g,
    describe: (m) =>
      `Dynamic-context execution prefix — Claude Code runs \`${truncate(
        m[1] ?? "",
      )}\` and injects its output before the model reads the file`,
  },
  {
    // curl/wget/fetch piped straight into a shell.
    ruleId: "RS021",
    severity: "high",
    regex:
      /\b(?:curl|wget|fetch)\b[^\n|]{0,300}\|\s*(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh|fish)\b/gi,
    describe: (m) => `Remote code execution: \`${truncate(m[0])}\` downloads and pipes straight into a shell`,
  },
  {
    // base64 decode piped to a shell / interpreter (either order).
    ruleId: "RS022",
    severity: "high",
    regex:
      /base64\s+(?:-d|--decode|-D)\b[^\n|]{0,200}\|\s*(?:bash|sh|zsh|python\d?|node|perl)\b|\|\s*base64\s+(?:-d|--decode|-D)\b[^\n|]{0,60}\|\s*(?:bash|sh|zsh)\b/gi,
    describe: (m) => `Obfuscated execution: \`${truncate(m[0])}\` decodes base64 and pipes it into an interpreter`,
  },
  {
    // Inline interpreter one-liners / eval — a weak, heuristic signal that is
    // noisy in prose and allow-lists, so it is low severity by design.
    ruleId: "RS022",
    severity: "low",
    regex:
      /\b(?:eval\s+["'$(`]|(?:python\d?|node|perl|ruby|php)\s+-[ce]\b|iex\s*\(|Invoke-Expression\b)/g,
    describe: (m) => `Inline code execution primitive: \`${truncate(m[0])}\``,
  },
];

function detectRegexRules(
  content: string,
  cps: Cp[],
  file: string,
  findings: Finding[],
  disabled: Set<RuleId>,
): void {
  for (const rule of REGEX_RULES) {
    if (disabled.has(rule.ruleId)) continue;
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[0] === "") {
        re.lastIndex++;
        continue;
      }
      const start = cpAtU16(cps, m.index);
      const line = start?.line ?? 1;
      const col = start?.col ?? 1;
      const byteOffset = start?.byte ?? 0;
      const endU16 = m.index + m[0].length;
      const endCp = cpAtU16(cps, endU16);
      const endByte = endCp ? endCp.byte : totalBytes(cps);
      findings.push({
        ruleId: rule.ruleId,
        severity: rule.severity,
        file,
        line,
        column: col,
        byteOffset,
        byteLength: Math.max(1, endByte - byteOffset),
        message: rule.describe(m),
        evidence: truncate(m[0], 200),
      });
    }
  }
}

function truncate(s: string, max = 80): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}
