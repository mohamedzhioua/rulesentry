import { test } from "node:test";
import assert from "node:assert/strict";
import { safeCanonical, perceivedText } from "../src/canonical.js";
import { buildReceipt, gitBlobSha1 } from "../src/receipt.js";
import { tag, ZWSP, RLO, NBSP, BOM } from "./helpers.js";

test("safeCanonical strips invisible characters", () => {
  assert.equal(safeCanonical("ad" + ZWSP + "min"), "admin");
  assert.equal(safeCanonical("Be nice." + tag(" evil")), "Be nice.");
  assert.equal(safeCanonical("x" + RLO + "y"), "xy");
});

test("safeCanonical normalizes deceptive whitespace to a plain space", () => {
  assert.equal(safeCanonical("a" + NBSP + "b"), "a b");
});

test("safeCanonical leaves homoglyphs and executable strings for review", () => {
  // Cyrillic а is intent-dependent — not auto-rewritten.
  assert.equal(safeCanonical("аdmin"), "аdmin");
  assert.equal(safeCanonical("curl x | bash"), "curl x | bash");
  assert.equal(safeCanonical("!`cat secret`"), "!`cat secret`");
});

test("safeCanonical preserves a benign leading BOM but strips mid-file ones", () => {
  assert.equal(safeCanonical(BOM + "title"), BOM + "title");
  assert.equal(safeCanonical("a" + BOM + "b"), "ab");
});

test("perceivedText maps homoglyphs to their ASCII look-alike", () => {
  assert.equal(perceivedText("аdmin"), "admin"); // Cyrillic а -> a
  assert.equal(perceivedText("ad" + ZWSP + "min"), "admin");
});

test("clean content is unchanged by both transforms", () => {
  const clean = "# Title\n\nBe helpful. Never leak secrets.\n";
  assert.equal(safeCanonical(clean), clean);
  assert.equal(perceivedText(clean), clean);
});

test("gitBlobSha1 is a 40-char hex string", () => {
  assert.match(gitBlobSha1("hello\n"), /^[0-9a-f]{40}$/);
});

test("buildReceipt flags a perception gap and stays clean otherwise", () => {
  const dirty = buildReceipt("Be nice." + tag(" evil"), "CLAUDE.md");
  assert.equal(dirty.differs, true);
  assert.notEqual(dirty.visibleSha256, dirty.agentReadSha256);
  assert.equal(dirty.surface, "claude-md");

  const clean = buildReceipt("Be nice.\n", "CLAUDE.md");
  assert.equal(clean.differs, false);
  assert.equal(clean.visibleSha256, clean.agentReadSha256);
});

test("a homoglyph alone still registers a perception gap in the receipt", () => {
  const r = buildReceipt("use the аdmin account", "AGENTS.md");
  assert.equal(r.differs, true);
  assert.equal(r.surface, "agents-md");
});
