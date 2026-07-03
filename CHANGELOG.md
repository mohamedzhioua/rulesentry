# Changelog

All notable changes to rulesentry are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-07-03

Feedback-driven release (thanks to early adopters on the launch thread).

### Added
- **`rulesentry fix`** — opt-in normalizer that rewrites files into a safe canonical
  form: removes unambiguously-invisible characters (zero-width, Tag, bidi controls,
  variation selectors, control chars) and normalizes deceptive whitespace. Homoglyphs
  and executable strings are never auto-rewritten (intent-dependent → human review).
  Dry-run by default (exits 1 on pending changes, CI-friendly); `--write` applies.
  Preserves a benign leading BOM. New `rulesentry-fix` pre-commit hook.
- **Load-boundary receipt** — every scanned file now reports a git blob hash, a
  `visibleSha256` (what a human reviewer perceives) and an `agentReadSha256` (what the
  agent reads), plus a `differs` flag. Turns "there is hidden Unicode" into a verifiable
  "the reviewer approved hash X, the agent ingests hash Y." Emitted in JSON (`receipts`)
  and summarized in pretty output.
- **Instruction-surface tagging** — findings and receipts are tagged with the surface
  they came from (`claude-md`, `agents-md`, `skill`, `slash-command`, `subagent`,
  `mcp-config`, `cursor-rules`, `copilot-instructions`, …), in JSON and SARIF.

### Fixed
- Variation-selector severity: a non-UTF-8 byte payload is no longer mis-ranked as
  printable text (it is `high`, not `critical`).

## [0.1.0] - 2026-07-03

Initial release.

### Added
- `rulesentry scan` — zero-config discovery and scanning of AI-agent config,
  rules, skill, and MCP files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
  `.github/copilot-instructions.md`, `.claude/**`, `.mcp.json`, `SKILL.md`, and more).
- Detection rules **RS001–RS022**: zero-width and invisible characters,
  bidirectional overrides (Trojan Source), Unicode Tag ASCII smuggling (decoded),
  variation-selector byte channels (decoded), other invisible/format characters,
  deceptive whitespace, disallowed control characters, homoglyph/mixed-script
  confusables, the `` !`command` `` dynamic-context execution prefix, and
  remote/obfuscated code-execution strings.
- "What you see vs. what the agent reads" reveal diff with decoded hidden payloads
  and exact UTF-8 byte offsets, line, and column.
- Output formats: `pretty` (default, quiet-by-default), `json`, and `sarif`
  (SARIF 2.1.0 with `security-severity` for GitHub code scanning).
- `rulesentry explain <RULE>`, `rulesentry list-rules`, `rulesentry demo`.
- GitHub Action (`action.yml`) with optional SARIF upload, and a pre-commit hook.
- `--fail-on` / `--min-severity` / `--disable` / `--no-homoglyph` / `--all` options.
- Zero runtime dependencies.

[0.2.0]: https://github.com/mohamedzhioua/rulesentry/releases/tag/v0.2.0
[0.1.0]: https://github.com/mohamedzhioua/rulesentry/releases/tag/v0.1.0
