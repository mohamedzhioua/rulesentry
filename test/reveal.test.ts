import { test } from "node:test";
import assert from "node:assert/strict";
import { revealText, hasHidden, sanitizeForTerminal } from "../src/reveal.js";
import { ZWSP, RLO } from "./helpers.js";

const ESC = String.fromCharCode(0x1b);
const C1 = String.fromCharCode(0x9b);

test("revealText marks zero-width and bidi characters", () => {
  assert.match(revealText("ad" + ZWSP + "min"), /⟦ZWSP⟧/);
  assert.match(revealText("x" + RLO + "y"), /⟦RLO⟧/);
});

test("revealText marks a Unicode Tag character with its ASCII", () => {
  assert.match(revealText(String.fromCodePoint(0xe0041)), /⟦TAG:A⟧/);
});

test("revealText marks control characters (not raw)", () => {
  const out = revealText("a" + ESC + "b");
  assert.match(out, /⟦CTRL:U\+001B⟧/);
  assert.ok(!out.includes(ESC));
});

test("revealText unmasks confusables only when asked", () => {
  const cyrillic = "аdmin"; // Cyrillic а + dmin
  assert.match(revealText(cyrillic, true), /⟪a⟫/);
  assert.ok(!revealText(cyrillic, false).includes("⟪a⟫"));
});

test("hasHidden distinguishes clean from hidden text", () => {
  assert.equal(hasHidden("clean ascii text"), false);
  assert.equal(hasHidden("has" + ZWSP + "hidden"), true);
});

test("sanitizeForTerminal neutralizes ESC and C1, keeps tab", () => {
  const out = sanitizeForTerminal("a" + ESC + "[31mred" + C1 + "b\tc");
  assert.ok(!out.includes(ESC), "ESC must be stripped");
  assert.ok(!out.includes(C1), "C1 must be stripped");
  assert.match(out, /⟦CTRL:U\+001B⟧/);
  assert.ok(out.includes("\t"), "tab preserved for layout");
});
