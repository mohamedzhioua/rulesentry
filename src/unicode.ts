/**
 * Unicode threat classification and decoding.
 *
 * This module is the heart of rulesentry: given a code point it decides
 * whether the character is one that renders invisibly (or deceptively) to a
 * human reviewer while still being read by an AI agent, and it decodes the two
 * families of characters that smuggle whole hidden messages — Unicode Tag
 * characters and variation-selector byte channels.
 *
 * It is intentionally pure and data-driven: no I/O, no state. Everything else
 * in the scanner builds on {@link classify}, {@link decodeTagRun} and
 * {@link decodeVariationRun}.
 */

import type { RuleId, Severity } from "./report.js";

export type UnicodeCategory =
  | "zero-width"
  | "bidi"
  | "tag"
  | "variation-selector"
  | "invisible"
  | "deceptive-space"
  | "control";

export interface CharClass {
  category: UnicodeCategory;
  /** Short human label, e.g. "ZERO WIDTH SPACE". */
  name: string;
  /** Rule this character maps to. */
  rule: RuleId;
  /** Baseline severity before any run-length/context escalation. */
  severity: Severity;
}

const CATEGORY_RULE: Record<UnicodeCategory, RuleId> = {
  "zero-width": "RS001",
  bidi: "RS002",
  tag: "RS003",
  "variation-selector": "RS004",
  invisible: "RS005",
  "deceptive-space": "RS006",
  control: "RS007",
};

const CATEGORY_SEVERITY: Record<UnicodeCategory, Severity> = {
  "zero-width": "high",
  bidi: "high",
  tag: "critical",
  "variation-selector": "high",
  invisible: "medium",
  "deceptive-space": "low",
  control: "high",
};

/** Named single code points, keyed by code point. */
const NAMED: Record<number, { category: UnicodeCategory; name: string }> = {
  // --- Zero-width / invisible math operators (RS001) ---
  0x200b: { category: "zero-width", name: "ZERO WIDTH SPACE" },
  0x200c: { category: "zero-width", name: "ZERO WIDTH NON-JOINER" },
  0x200d: { category: "zero-width", name: "ZERO WIDTH JOINER" },
  0x2060: { category: "zero-width", name: "WORD JOINER" },
  0x2061: { category: "zero-width", name: "FUNCTION APPLICATION" },
  0x2062: { category: "zero-width", name: "INVISIBLE TIMES" },
  0x2063: { category: "zero-width", name: "INVISIBLE SEPARATOR" },
  0x2064: { category: "zero-width", name: "INVISIBLE PLUS" },
  0xfeff: { category: "zero-width", name: "ZERO WIDTH NO-BREAK SPACE (BOM)" },
  0x180e: { category: "zero-width", name: "MONGOLIAN VOWEL SEPARATOR" },

  // --- Bidirectional controls & overrides (RS002) ---
  0x202a: { category: "bidi", name: "LEFT-TO-RIGHT EMBEDDING" },
  0x202b: { category: "bidi", name: "RIGHT-TO-LEFT EMBEDDING" },
  0x202c: { category: "bidi", name: "POP DIRECTIONAL FORMATTING" },
  0x202d: { category: "bidi", name: "LEFT-TO-RIGHT OVERRIDE" },
  0x202e: { category: "bidi", name: "RIGHT-TO-LEFT OVERRIDE" },
  0x2066: { category: "bidi", name: "LEFT-TO-RIGHT ISOLATE" },
  0x2067: { category: "bidi", name: "RIGHT-TO-LEFT ISOLATE" },
  0x2068: { category: "bidi", name: "FIRST STRONG ISOLATE" },
  0x2069: { category: "bidi", name: "POP DIRECTIONAL ISOLATE" },
  0x200e: { category: "bidi", name: "LEFT-TO-RIGHT MARK" },
  0x200f: { category: "bidi", name: "RIGHT-TO-LEFT MARK" },
  0x061c: { category: "bidi", name: "ARABIC LETTER MARK" },

  // --- Other invisible / format characters (RS005) ---
  0x00ad: { category: "invisible", name: "SOFT HYPHEN" },
  0x034f: { category: "invisible", name: "COMBINING GRAPHEME JOINER" },
  0x115f: { category: "invisible", name: "HANGUL CHOSEONG FILLER" },
  0x1160: { category: "invisible", name: "HANGUL JUNGSEONG FILLER" },
  0x17b4: { category: "invisible", name: "KHMER VOWEL INHERENT AQ" },
  0x17b5: { category: "invisible", name: "KHMER VOWEL INHERENT AA" },
  0x3164: { category: "invisible", name: "HANGUL FILLER" },
  0xffa0: { category: "invisible", name: "HALFWIDTH HANGUL FILLER" },
  0x2800: { category: "invisible", name: "BRAILLE PATTERN BLANK" },
  0xfff9: { category: "invisible", name: "INTERLINEAR ANNOTATION ANCHOR" },
  0xfffa: { category: "invisible", name: "INTERLINEAR ANNOTATION SEPARATOR" },
  0xfffb: { category: "invisible", name: "INTERLINEAR ANNOTATION TERMINATOR" },

  // --- Deceptive whitespace: renders like U+0020 but is not (RS006) ---
  0x00a0: { category: "deceptive-space", name: "NO-BREAK SPACE" },
  0x1680: { category: "deceptive-space", name: "OGHAM SPACE MARK" },
  0x2000: { category: "deceptive-space", name: "EN QUAD" },
  0x2001: { category: "deceptive-space", name: "EM QUAD" },
  0x2002: { category: "deceptive-space", name: "EN SPACE" },
  0x2003: { category: "deceptive-space", name: "EM SPACE" },
  0x2004: { category: "deceptive-space", name: "THREE-PER-EM SPACE" },
  0x2005: { category: "deceptive-space", name: "FOUR-PER-EM SPACE" },
  0x2006: { category: "deceptive-space", name: "SIX-PER-EM SPACE" },
  0x2007: { category: "deceptive-space", name: "FIGURE SPACE" },
  0x2008: { category: "deceptive-space", name: "PUNCTUATION SPACE" },
  0x2009: { category: "deceptive-space", name: "THIN SPACE" },
  0x200a: { category: "deceptive-space", name: "HAIR SPACE" },
  0x202f: { category: "deceptive-space", name: "NARROW NO-BREAK SPACE" },
  0x205f: { category: "deceptive-space", name: "MEDIUM MATHEMATICAL SPACE" },
  0x3000: { category: "deceptive-space", name: "IDEOGRAPHIC SPACE" },
};

/**
 * Classify a single code point. Returns `null` for ordinary, safe characters
 * (the overwhelming common case), so callers can cheaply skip them.
 */
export function classify(cp: number): CharClass | null {
  // Unicode Tag characters — carry hidden ASCII (RS003). U+E0000..U+E007F.
  if (cp >= 0xe0000 && cp <= 0xe007f) {
    return mk("tag", tagName(cp));
  }
  // Variation selectors — abused as a byte channel (RS004).
  if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) {
    return mk("variation-selector", variationName(cp));
  }
  const named = NAMED[cp];
  if (named) return mk(named.category, named.name);

  // Disallowed control characters (RS007): C0/C1 except the three we expect in
  // text (tab, line feed, carriage return). U+0000..U+001F and U+007F..U+009F.
  if (
    (cp <= 0x001f && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) ||
    (cp >= 0x007f && cp <= 0x009f)
  ) {
    return mk("control", controlName(cp));
  }
  return null;
}

function mk(category: UnicodeCategory, name: string): CharClass {
  return {
    category,
    name,
    rule: CATEGORY_RULE[category],
    severity: CATEGORY_SEVERITY[category],
  };
}

function tagName(cp: number): string {
  if (cp === 0xe0001) return "LANGUAGE TAG";
  if (cp === 0xe007f) return "CANCEL TAG";
  const ascii = cp - 0xe0000;
  if (ascii >= 0x20 && ascii <= 0x7e) {
    return `TAG '${String.fromCharCode(ascii)}'`;
  }
  return `TAG U+${hex(cp)}`;
}

function variationName(cp: number): string {
  if (cp >= 0xfe00 && cp <= 0xfe0f) return `VARIATION SELECTOR-${cp - 0xfe00 + 1}`;
  return `VARIATION SELECTOR-${cp - 0xe0100 + 17}`;
}

function controlName(cp: number): string {
  const C0: Record<number, string> = {
    0x00: "NULL",
    0x07: "BELL",
    0x08: "BACKSPACE",
    0x0b: "LINE TABULATION",
    0x0c: "FORM FEED",
    0x1b: "ESCAPE",
  };
  return C0[cp] ?? `CONTROL U+${hex(cp)}`;
}

export function hex(cp: number): string {
  return cp.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Decode a run of Unicode Tag code points to the ASCII string they smuggle.
 * Tag characters mirror ASCII: U+E0020..U+E007E map to U+0020..U+007E.
 * U+E0001 (language tag) and U+E007F (cancel) are structural, not text.
 */
export function decodeTagRun(cps: number[]): string {
  let out = "";
  for (const cp of cps) {
    if (cp === 0xe0001 || cp === 0xe007f) continue;
    const ascii = cp - 0xe0000;
    if (ascii >= 0x20 && ascii <= 0x7e) out += String.fromCharCode(ascii);
  }
  return out;
}

export interface VariationDecode {
  /** Human-presentable form: decoded text, or a hex dump of the raw bytes. */
  decoded: string;
  /** "text" when the bytes formed printable text; "bytes" otherwise. */
  kind: "text" | "bytes";
}

/**
 * Decode a run of variation selectors to the bytes they smuggle, using the
 * widely-published emoji byte channel: byte 0..15 -> U+FE00..U+FE0F,
 * byte 16..255 -> U+E0100..U+E01EF. Returns printable decoded text when the
 * bytes form valid printable UTF-8, otherwise a hex dump tagged as bytes so
 * callers don't mistake the hex string itself for "printable text".
 */
export function decodeVariationRun(cps: number[]): VariationDecode {
  const bytes: number[] = [];
  for (const cp of cps) {
    if (cp >= 0xfe00 && cp <= 0xfe0f) bytes.push(cp - 0xfe00);
    else if (cp >= 0xe0100 && cp <= 0xe01ef) bytes.push(cp - 0xe0100 + 16);
  }
  if (bytes.length === 0) return { decoded: "", kind: "bytes" };
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(bytes),
    );
    // Only surface as text if printable. Deliberately excludes control
    // whitespace (\n \r \t) so a decoded byte channel cannot inject line breaks.
    if (/^[\x20-\x7e\p{L}\p{N}\p{P}\p{S}]*$/u.test(decoded)) {
      return { decoded, kind: "text" };
    }
  } catch {
    /* not valid UTF-8 — fall through to hex */
  }
  return {
    decoded: bytes.map((b) => b.toString(16).padStart(2, "0")).join(" "),
    kind: "bytes",
  };
}
