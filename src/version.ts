/**
 * Single source of truth for the version string at runtime.
 *
 * We read package.json at load time rather than hard-coding, so a published
 * build always reports the version it shipped as. Kept in its own module so it
 * can be mocked in tests and imported without pulling in the CLI.
 */

import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

function resolveVersion(): string {
  try {
    // dist/version.js -> ../package.json
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION = resolveVersion();
