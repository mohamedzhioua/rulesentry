/**
 * Cross-version test runner.
 *
 * `node --test` glob patterns require Node 21+, a bare directory argument is
 * unreliable across versions/OSes, and default discovery wrongly picks up the
 * TypeScript sources in `test/`. Passing explicit compiled file paths to
 * `--test` works on Node 18, 20, and 22 on every platform, so we enumerate the
 * built test files ourselves.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

const dir = path.join("dist-test", "test");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => path.join(dir, f));

if (files.length === 0) {
  console.error(`no compiled test files found in ${dir} — run the build first`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
