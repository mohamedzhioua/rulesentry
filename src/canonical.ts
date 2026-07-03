/**
 * Canonicalization transforms.
 *
 * Two related normalizations, both driven by the same classifier used for
 * detection so they can never drift from what rulesentry flags:
 *
 * - {@link safeCanonical} — the *fixer* form. Removes characters that render to
 *   nothing or reorder text (zero-width, Tag, variation selectors, bidi
 *   controls, other invisibles, control chars) and normalizes deceptive
 *   whitespace to a plain space. It deliberately does NOT touch homoglyphs or
 *   executable strings: rewriting those depends on intent, so they stay
 *   flag-only for human review.
 *
 * - {@link perceivedText} — models what a human reviewer *believes* the file
 *   says: the safe-canonical form plus mapping homoglyph look-alikes to their
 *   ASCII equivalent. Hashing this against the raw content is the "load-boundary
 *   receipt": if the hashes differ, the reviewer's perception and the agent's
 *   input are not the same file.
 *
 * A leading byte-order mark (U+FEFF at offset 0) is benign and preserved by
 * both, matching the scanner, so a plain BOM never registers as a difference.
 */

import { classify } from "./unicode.js";
import { confusableToAscii } from "./confusables.js";

/** Categories that render invisibly or reorder text — removed by both forms. */
const STRIP_CATEGORIES = new Set([
  "zero-width",
  "tag",
  "variation-selector",
  "bidi",
  "invisible",
  "control",
]);

function transform(content: string, mapChar: (cp: number, ch: string) => string): string {
  let out = "";
  let first = true;
  for (const ch of content) {
    const cp = ch.codePointAt(0)!;
    if (first) {
      first = false;
      if (cp === 0xfeff) {
        out += ch; // preserve a benign leading BOM
        continue;
      }
    }
    out += mapChar(cp, ch);
  }
  return out;
}

/** The safe canonical (fixer) form — invisible stripped, deceptive space → " ". */
export function safeCanonical(content: string): string {
  return transform(content, (cp, ch) => {
    const info = classify(cp);
    if (info) {
      if (STRIP_CATEGORIES.has(info.category)) return "";
      if (info.category === "deceptive-space") return " ";
    }
    return ch;
  });
}

/** What a human reviewer perceives — safe canonical plus homoglyph → ASCII. */
export function perceivedText(content: string): string {
  return transform(content, (cp, ch) => {
    const info = classify(cp);
    if (info) {
      if (STRIP_CATEGORIES.has(info.category)) return "";
      if (info.category === "deceptive-space") return " ";
    }
    const ascii = confusableToAscii(cp);
    if (ascii) return ascii;
    return ch;
  });
}
