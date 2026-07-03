/** Shared test helpers for building strings with (safe, inert) hidden chars. */

/** Encode ASCII as invisible Unicode Tag characters. */
export function tag(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    out += cp >= 0x20 && cp <= 0x7e ? String.fromCodePoint(0xe0000 + cp) : ch;
  }
  return out;
}

/** Encode bytes as a variation-selector run (Paul Butler emoji channel). */
export function vsBytes(bytes: number[]): string {
  let out = "";
  for (const b of bytes) {
    out += b < 16 ? String.fromCodePoint(0xfe00 + b) : String.fromCodePoint(0xe0100 + (b - 16));
  }
  return out;
}

export const ZWSP = "​";
export const ZWNJ = "‌";
export const RLO = "‮";
export const PDF = "‬";
export const NBSP = " ";
export const BOM = "﻿";
