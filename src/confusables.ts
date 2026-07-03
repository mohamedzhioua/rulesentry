/**
 * Homoglyph (confusable) detection data.
 *
 * A curated map from non-ASCII code points to the ASCII letter/digit they
 * visually impersonate. This is deliberately conservative — it covers the
 * scripts actually used in real spoofing attacks (Cyrillic, Greek, fullwidth
 * Latin, a few Armenian/Cherokee look-alikes) rather than the full Unicode
 * confusables table, because the detector only fires on *mixed-script* tokens
 * (see detect.ts), and a smaller map keeps the intent legible and auditable.
 */

/** Map of confusable code point -> the ASCII character it mimics. */
export const CONFUSABLES: Record<number, string> = {
  // --- Cyrillic lowercase ---
  0x0430: "a", // а
  0x0435: "e", // е
  0x043e: "o", // о
  0x0440: "p", // р
  0x0441: "c", // с
  0x0445: "x", // х
  0x0443: "y", // у
  0x0456: "i", // і
  0x0458: "j", // ј
  0x0455: "s", // ѕ
  0x04bb: "h", // һ
  0x0501: "d", // ԁ
  0x051b: "q", // ԛ
  0x051d: "w", // ԝ
  0x043a: "k", // к (approx)
  0x0261: "g", // ɡ LATIN SMALL LETTER SCRIPT G
  // --- Cyrillic uppercase ---
  0x0410: "A", // А
  0x0412: "B", // В
  0x0415: "E", // Е
  0x041a: "K", // К
  0x041c: "M", // М
  0x041d: "H", // Н
  0x041e: "O", // О
  0x0420: "P", // Р
  0x0421: "C", // С
  0x0422: "T", // Т
  0x0425: "X", // Х
  0x0405: "S", // Ѕ
  0x0406: "I", // І
  0x0408: "J", // Ј
  0x04c0: "I", // Ӏ
  // --- Greek ---
  0x03bf: "o", // ο
  0x03b1: "a", // α (approx)
  0x03c1: "p", // ρ
  0x03bd: "v", // ν
  0x0391: "A", // Α
  0x0392: "B", // Β
  0x0395: "E", // Ε
  0x0396: "Z", // Ζ
  0x0397: "H", // Η
  0x0399: "I", // Ι
  0x039a: "K", // Κ
  0x039c: "M", // Μ
  0x039d: "N", // Ν
  0x039f: "O", // Ο
  0x03a1: "P", // Ρ
  0x03a4: "T", // Τ
  0x03a5: "Y", // Υ
  0x03a7: "X", // Χ
  0x03b3: "y", // γ (approx)
  // --- Armenian / Cherokee occasional look-alikes ---
  0x0585: "o", // օ Armenian
  0x13a0: "D", // Ꭰ Cherokee (approx)
  0x13c3: "P", // Ꮃ approx
};

// Fullwidth Latin (U+FF21..FF3A -> A-Z, U+FF41..FF5A -> a-z) and fullwidth
// digits (U+FF10..FF19) are added programmatically so the literal map above
// stays readable.
for (let cp = 0xff21; cp <= 0xff3a; cp++) {
  CONFUSABLES[cp] = String.fromCharCode(cp - 0xff21 + 0x41);
}
for (let cp = 0xff41; cp <= 0xff5a; cp++) {
  CONFUSABLES[cp] = String.fromCharCode(cp - 0xff41 + 0x61);
}
for (let cp = 0xff10; cp <= 0xff19; cp++) {
  CONFUSABLES[cp] = String.fromCharCode(cp - 0xff10 + 0x30);
}

/** The ASCII character this code point impersonates, or null. */
export function confusableToAscii(cp: number): string | null {
  return CONFUSABLES[cp] ?? null;
}

/** True for a plain ASCII letter or digit. */
export function isAsciiAlnum(cp: number): boolean {
  return (
    (cp >= 0x30 && cp <= 0x39) ||
    (cp >= 0x41 && cp <= 0x5a) ||
    (cp >= 0x61 && cp <= 0x7a)
  );
}
