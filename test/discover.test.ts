import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { discover, isAgentFile, surfaceOf } from "../src/discover.js";

test("surfaceOf classifies agent instruction surfaces", () => {
  assert.equal(surfaceOf("CLAUDE.md"), "claude-md");
  assert.equal(surfaceOf("sub/AGENTS.md"), "agents-md");
  assert.equal(surfaceOf(".mcp.json"), "mcp-config");
  assert.equal(surfaceOf(".claude/skills/x/SKILL.md"), "skill");
  assert.equal(surfaceOf(".claude/commands/deploy.md"), "slash-command");
  assert.equal(surfaceOf(".claude/agents/rev.md"), "subagent");
  assert.equal(surfaceOf(".cursorrules"), "cursor-rules");
  assert.equal(surfaceOf(".github/copilot-instructions.md"), "copilot-instructions");
  assert.equal(surfaceOf("src/index.ts"), "other");
});

test("isAgentFile matches known agent config paths", () => {
  const yes = [
    "CLAUDE.md",
    "sub/AGENTS.md",
    ".cursorrules",
    ".github/copilot-instructions.md",
    ".github/instructions/py.instructions.md",
    ".claude/commands/deploy.md",
    ".claude/skills/foo/SKILL.md",
    ".cursor/rules/style.mdc",
    ".mcp.json",
    "packages/x/.mcp.json",
    "GEMINI.md",
    ".windsurf/rules/x.md",
  ];
  for (const p of yes) assert.equal(isAgentFile(p), true, `should match ${p}`);
});

test("isAgentFile rejects ordinary source & docs", () => {
  const no = ["src/index.ts", "README.md", "docs/guide.md", "package.json", "test/x.test.ts"];
  for (const p of no) assert.equal(isAgentFile(p), false, `should skip ${p}`);
});

test("discover walks a directory and finds only agent files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rulesentry-"));
  try {
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# c\n");
    fs.writeFileSync(path.join(dir, "README.md"), "# readme\n");
    fs.mkdirSync(path.join(dir, ".claude", "skills", "s"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "skills", "s", "SKILL.md"), "# s\n");
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "CLAUDE.md"), "# skip\n");

    const { files } = discover([], dir);
    const rels = files.map((f) => path.relative(dir, f).replace(/\\/g, "/")).sort();
    assert.deepEqual(rels, ["CLAUDE.md", ".claude/skills/s/SKILL.md"].sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an explicit file argument is scanned regardless of name", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rulesentry-"));
  try {
    const p = path.join(dir, "random.txt");
    fs.writeFileSync(p, "hello\n");
    const { files } = discover([p], dir);
    assert.equal(files.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--all picks up non-agent text files that default discovery skips", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rulesentry-"));
  try {
    fs.writeFileSync(path.join(dir, "README.md"), "# readme\n");
    assert.equal(discover([dir], dir).files.length, 0);
    assert.equal(discover([dir], dir, { all: true }).files.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a file larger than maxBytes is reported as skippedLarge, not scanned", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rulesentry-"));
  try {
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "x".repeat(4096));
    const { files, skippedLarge } = discover([], dir, { maxBytes: 1024 });
    assert.equal(files.length, 0);
    assert.equal(skippedLarge.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("symlinks are not followed during discovery", { skip: process.platform === "win32" ? "symlink perms on Windows" : false }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rulesentry-"));
  try {
    fs.mkdirSync(path.join(dir, "real"));
    fs.writeFileSync(path.join(dir, "real", "CLAUDE.md"), "# c\n");
    fs.symlinkSync(path.join(dir, "real"), path.join(dir, "link"), "dir");
    const { files } = discover([], dir);
    // Only the real file, never the one reachable via the symlink.
    assert.equal(files.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
