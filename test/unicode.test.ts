import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  decodeTagRun,
  decodeVariationRun,
} from "../src/unicode.js";

test("classify returns null for ordinary characters", () => {
  for (const ch of "Hello, world! 123 café résumé — 日本語") {
    // café/日本語 are ordinary letters, not confusables/invisibles
    assert.equal(classify(ch.codePointAt(0)!), null, `unexpected hit on ${ch}`);
  }
});

test("classify tags zero-width characters", () => {
  const zwsp = classify(0x200b);
  assert.equal(zwsp?.category, "zero-width");
  assert.equal(zwsp?.rule, "RS001");
});

test("classify tags bidi controls", () => {
  assert.equal(classify(0x202e)?.category, "bidi");
  assert.equal(classify(0x2066)?.category, "bidi");
});

test("classify tags Unicode Tag characters as critical", () => {
  const c = classify(0xe0041); // TAG 'A'
  assert.equal(c?.category, "tag");
  assert.equal(c?.severity, "critical");
});

test("classify tags variation selectors", () => {
  assert.equal(classify(0xfe00)?.category, "variation-selector");
  assert.equal(classify(0xe0100)?.category, "variation-selector");
});

test("classify tags control chars but allows tab/newline/CR", () => {
  assert.equal(classify(0x09), null);
  assert.equal(classify(0x0a), null);
  assert.equal(classify(0x0d), null);
  assert.equal(classify(0x00)?.category, "control");
  assert.equal(classify(0x1b)?.category, "control");
});

test("decodeTagRun recovers smuggled ASCII", () => {
  const cps = [..."rm -rf ~"].map((c) => 0xe0000 + c.codePointAt(0)!);
  assert.equal(decodeTagRun(cps), "rm -rf ~");
});

test("decodeTagRun ignores structural tag chars", () => {
  const cps = [0xe0001, 0xe0041, 0xe0042, 0xe007f]; // LANG, 'A', 'B', CANCEL
  assert.equal(decodeTagRun(cps), "AB");
});

test("decodeVariationRun recovers bytes as text", () => {
  const bytes = [...Buffer.from("hi", "utf8")];
  const cps = bytes.map((b) =>
    b < 16 ? 0xfe00 + b : 0xe0100 + (b - 16),
  );
  const r = decodeVariationRun(cps);
  assert.equal(r.decoded, "hi");
  assert.equal(r.kind, "text");
});

test("decodeVariationRun tags non-UTF8 bytes as a hex dump", () => {
  const cps = [0xfe00, 0xfe01, 0xe0100 + (0xff - 16)]; // 0x00 0x01 0xff
  const r = decodeVariationRun(cps);
  assert.equal(r.kind, "bytes");
  assert.match(r.decoded, /^[0-9a-f ]+$/);
});
