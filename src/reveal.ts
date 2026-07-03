/**
 * The "what you see vs. what the agent reads" view.
 *
 * A human reviewer sees rendered glyphs; the agent reads raw code points.
 * {@link revealText} rewrites a span so every invisible or deceptive character
 * becomes a visible, labelled marker — turning an innocent-looking line into
 * the sentence the agent actually ingests.
 */

import { classify, hex } from "./unicode.js";
import { confusableToAscii } from "./confusables.js";

/** Compact visible marker for one suspicious code point. */
function marker(cp: number): string | null {
  const info = classify(cp);
  if (info) {
    switch (info.category) {
      case "tag": {
        const ascii = cp - 0xe0000;
        if (ascii >= 0x20 && ascii <= 0x7e) {
          return `⟦TAG:${String.fromCharCode(ascii)}⟧`;
        }
        return `⟦TAG:U+${hex(cp)}⟧`;
      }
      case "variation-selector":
        return `⟦VS:U+${hex(cp)}⟧`;
      case "zero-width":
        return `⟦${abbrev(info.name)}⟧`;
      case "bidi":
        return `⟦${abbrev(info.name)}⟧`;
      case "invisible":
        return `⟦${abbrev(info.name)}⟧`;
      case "deceptive-space":
        return `⟦${abbrev(info.name)}⟧`;
      case "control":
        return `⟦CTRL:U+${hex(cp)}⟧`;
    }
  }
  return null;
}

function abbrev(name: string): string {
  const map: Record<string, string> = {
    "ZERO WIDTH SPACE": "ZWSP",
    "ZERO WIDTH NON-JOINER": "ZWNJ",
    "ZERO WIDTH JOINER": "ZWJ",
    "WORD JOINER": "WJ",
    "ZERO WIDTH NO-BREAK SPACE (BOM)": "BOM",
    "LEFT-TO-RIGHT OVERRIDE": "LRO",
    "RIGHT-TO-LEFT OVERRIDE": "RLO",
    "LEFT-TO-RIGHT EMBEDDING": "LRE",
    "RIGHT-TO-LEFT EMBEDDING": "RLE",
    "POP DIRECTIONAL FORMATTING": "PDF",
    "LEFT-TO-RIGHT ISOLATE": "LRI",
    "RIGHT-TO-LEFT ISOLATE": "RLI",
    "FIRST STRONG ISOLATE": "FSI",
    "POP DIRECTIONAL ISOLATE": "PDI",
    "LEFT-TO-RIGHT MARK": "LRM",
    "RIGHT-TO-LEFT MARK": "RLM",
    "ARABIC LETTER MARK": "ALM",
    "SOFT HYPHEN": "SHY",
    "NO-BREAK SPACE": "NBSP",
    "NARROW NO-BREAK SPACE": "NNBSP",
    "IDEOGRAPHIC SPACE": "IDSP",
  };
  return map[name] ?? name.replace(/[^A-Z0-9]+/gi, "").slice(0, 6).toUpperCase();
}

/**
 * Render text with every hidden/deceptive character replaced by a visible
 * marker. Optionally also unmask homoglyphs (Cyrillic 'а' -> ⟪a⟫) so a spoofed
 * word reads as what it impersonates.
 */
export function revealText(text: string, unmaskConfusables = false): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const mk = marker(cp);
    if (mk) {
      out += mk;
      continue;
    }
    if (unmaskConfusables) {
      const ascii = confusableToAscii(cp);
      if (ascii) {
        out += `⟪${ascii}⟫`;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** True if the text contains any character revealText would mark. */
export function hasHidden(text: string): boolean {
  for (const ch of text) {
    if (marker(ch.codePointAt(0)!)) return true;
  }
  return false;
}

/**
 * Neutralize control characters before writing attacker-derived text to a
 * terminal. A scanner of hostile files must never let a scanned file emit raw
 * ANSI escape / cursor / screen-clear sequences into the user's terminal, so we
 * replace C0 (except tab), DEL, and C1 controls with a visible placeholder.
 * Used for every file-derived string in the pretty renderer.
 */
export function sanitizeForTerminal(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp <= 0x08) ||
      (cp >= 0x0a && cp <= 0x1f) ||
      cp === 0x7f ||
      (cp >= 0x80 && cp <= 0x9f)
    ) {
      out += `⟦CTRL:U+${hex(cp)}⟧`;
    } else {
      out += ch; // tab (0x09) is left as-is for layout
    }
  }
  return out;
}
