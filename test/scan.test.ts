import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { run, readTextFile } from "../src/scan.js";
import { renderJson } from "../src/render/json.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rulesentry-scan-"));
}

test("a binary file (NUL byte) is reported as an error with no findings", () => {
  const dir = tmpDir();
  try {
    const p = path.join(dir, "CLAUDE.md");
    fs.writeFileSync(p, Buffer.from([0x41, 0x00, 0x42]));
    const { report } = run([], { cwd: dir });
    const fr = report.files.find((f) => f.file === "CLAUDE.md");
    assert.ok(fr);
    assert.equal(fr!.findings.length, 0);
    assert.match(fr!.error ?? "", /binary/);
    const json = JSON.parse(renderJson(report));
    assert.equal(json.readErrors.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readTextFile degrades gracefully on a missing path", () => {
  const r = readTextFile(path.join(os.tmpdir(), "does-not-exist-rulesentry.md"));
  assert.ok("error" in r);
});

test("an explicit file larger than maxBytes is skipped, not read", () => {
  const dir = tmpDir();
  try {
    const p = path.join(dir, "big.md");
    fs.writeFileSync(p, "x".repeat(2048));
    const { report, skippedLarge } = run([p], { cwd: dir, maxBytes: 1024 });
    assert.equal(report.files.length, 0);
    assert.equal(skippedLarge.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("run makes report paths relative to cwd with forward slashes", () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, ".claude", "skills", "s"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "skills", "s", "SKILL.md"), "ok\n");
    const { report } = run([], { cwd: dir });
    assert.deepEqual(
      report.files.map((f) => f.file),
      [".claude/skills/s/SKILL.md"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
