# Changelog

All notable changes to rulesentry are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project adheres to
[Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/mohamedzhioua/rulesentry/releases/tag/v0.1.0
