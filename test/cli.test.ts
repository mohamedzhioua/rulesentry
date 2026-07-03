import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

const CLI = path.resolve("dist/cli.js");
const REPO = path.resolve(".");

function cli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

test("--version prints a semver", () => {
  const r = cli(["--version"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("demo exits 0 and reveals the smuggled payload", () => {
  const r = cli(["demo"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /decoded/);
  assert.match(r.stdout, /TAG/);
});

test("scanning the malicious fixture fails with exit 1 and reports RS003", () => {
  const r = cli(["scan", "examples/malicious-CLAUDE.md"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /RS003/);
  assert.match(r.stdout, /CRITICAL/);
});

test("scanning the clean fixture exits 0", () => {
  const r = cli(["scan", "examples/clean-CLAUDE.md"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no hidden instructions/);
});

test("json format emits parseable output", () => {
  const r = cli(["scan", "examples/malicious-CLAUDE.md", "--format", "json"]);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.tool, "rulesentry");
  assert.ok(parsed.findings.length > 0);
});

test("explain prints rule documentation", () => {
  const r = cli(["explain", "RS003"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /ASCII smuggling/);
});

test("unknown option exits 2", () => {
  const r = cli(["scan", "--nope"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option/);
});

test("--min-severity does not change the exit code", () => {
  // Quieting output to critical-only still exits 1 because a high finding
  // exists and the default --fail-on is medium.
  const r = cli(["scan", "examples/malicious-CLAUDE.md", "--min-severity", "critical"]);
  assert.equal(r.status, 1);
  // Only the one critical finding (RS003) is displayed.
  assert.match(r.stdout, /RS003/);
  assert.ok(!r.stdout.includes("RS001"));
});

test("explain on an unknown rule exits 2", () => {
  const r = cli(["explain", "RS999"]);
  assert.equal(r.status, 2);
});

test("--fail-on high does not fail on a medium-only finding", () => {
  // The clean fixture has no findings; use --disable to reduce malicious to
  // medium-and-below by turning off the high/critical rules.
  const r = cli([
    "scan",
    "examples/malicious-CLAUDE.md",
    "--disable",
    "RS001,RS002,RS003,RS020,RS021",
    "--fail-on",
    "high",
  ]);
  // Only RS010 (medium) remains -> below the high gate -> exit 0.
  assert.equal(r.status, 0);
});
