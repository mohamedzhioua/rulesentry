/**
 * The "load-boundary receipt" — a small, verifiable record of exactly what an
 * agent would ingest from a file versus what a human reviewer perceives.
 *
 * The point (raised by early users): a code reviewer approves rendered text,
 * but the agent reads raw code points. Emitting a hash of each — plus the git
 * blob hash so the receipt pins to a specific committed blob — turns "there is
 * hidden Unicode" into "the reviewer approved hash X, the agent ingests hash Y,
 * and they differ." That is auditable in a way a warning is not.
 */

import { createHash } from "node:crypto";
import { perceivedText } from "./canonical.js";
import { surfaceOf, type Surface } from "./discover.js";

export interface Receipt {
  file: string;
  surface: Surface;
  /** git blob hash (`git hash-object`) of the UTF-8 content. */
  gitBlobSha1: string;
  /** sha256 of what a human reviewer perceives ({@link perceivedText}). */
  visibleSha256: string;
  /** sha256 of the raw content the agent actually reads. */
  agentReadSha256: string;
  /** True when perceived text and agent-read text are not identical. */
  differs: boolean;
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Git's blob object hash: sha1 over `blob <bytelen>\0<content>`. Matches
 * `git hash-object <file>` for UTF-8 files.
 */
export function gitBlobSha1(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

export function buildReceipt(content: string, file: string): Receipt {
  const visible = perceivedText(content);
  const visibleSha256 = sha256(visible);
  const agentReadSha256 = sha256(content);
  return {
    file,
    surface: surfaceOf(file),
    gitBlobSha1: gitBlobSha1(content),
    visibleSha256,
    agentReadSha256,
    differs: visibleSha256 !== agentReadSha256,
  };
}
