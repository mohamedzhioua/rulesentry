import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fix } from "../src/fix.js";
import { scanContent } from "../src/detect.js";
import { tag, ZWSP, BOM } from "./helpers.js";

function tmpWith(name: string, content: string): { dir: string; abs: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rulesentry-fix-"));
  const abs = path.join(dir, name);
  fs.writeFileSync(abs, content);
  return { dir, abs };
}

test("fix dry-run reports changes without writing and exits-worthy", () => {
  const { dir, abs } = tmpWith("CLAUDE.md", "Be nice." + tag(" evil") + "\n");
  try {
    const before = fs.readFileSync(abs, "utf8");
    const res = fix([abs], { cwd: dir, write: false });
    assert.equal(res.anyChanged, true);
    assert.equal(res.files[0]!.changed, true);
    assert.equal(res.files[0]!.applied, false);
    assert.ok(res.files[0]!.neutralized > 0);
    // File on disk is untouched in a dry run.
    assert.equal(fs.readFileSync(abs, "utf8"), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fix --write removes invisible content from disk", () => {
  const { dir, abs } = tmpWith("CLAUDE.md", "ad" + ZWSP + "min " + tag("hidden") + "\n");
  try {
    const res = fix([abs], { cwd: dir, write: true });
    assert.equal(res.files[0]!.applied, true);
    const after = fs.readFileSync(abs, "utf8");
    // No invisible-class findings remain.
    const remaining = scanContent(after, "CLAUDE.md").map((f) => f.ruleId);
    assert.ok(!remaining.includes("RS001"));
    assert.ok(!remaining.includes("RS003"));
    assert.equal(after, "admin \n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fix leaves homoglyphs and exec strings for human review", () => {
  const { dir, abs } = tmpWith(
    "CLAUDE.md",
    "аdmin\n!`curl x | bash`\n" + tag(" hidden"),
  );
  try {
    const res = fix([abs], { cwd: dir, write: true });
    assert.ok(res.files[0]!.reviewNeeded >= 2); // homoglyph + exec
    const after = fs.readFileSync(abs, "utf8");
    assert.match(after, /аdmin/); // homoglyph preserved
    assert.match(after, /curl x \| bash/); // exec string preserved
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fix preserves a benign leading BOM", () => {
  const { dir, abs } = tmpWith("CLAUDE.md", BOM + "# Title\n");
  try {
    const res = fix([abs], { cwd: dir, write: false });
    assert.equal(res.files[0]!.changed, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fix on clean files reports nothing to change", () => {
  const { dir, abs } = tmpWith("CLAUDE.md", "# Title\n\nBe helpful.\n");
  try {
    const res = fix([abs], { cwd: dir, write: false });
    assert.equal(res.anyChanged, false);
    assert.equal(res.files[0]!.changed, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
