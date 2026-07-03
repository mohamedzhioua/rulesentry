# Contributing to rulesentry

Thanks for helping! rulesentry aims to be a small, sharp, zero-dependency tool.

## Principles

- **Zero runtime dependencies.** Detection uses only the Node standard library.
  A security tool should have a clean supply chain.
- **Quiet by default.** A clean scan prints one line. Don't add noise.
- **Low false positives.** New detections must be defensible and, where risky,
  default to a lower severity. Every rule needs both a positive test and a
  false-positive guard test.
- **Byte-accurate.** Findings carry exact UTF-8 byte offsets; keep it that way.

## Setup

```bash
npm install
npm run build      # compile src/ -> dist/
npm test           # build + compile tests + run node:test
npm run typecheck  # strict tsc, no emit
```

## Adding a rule

1. If it's a Unicode character class, extend `src/unicode.ts` (`NAMED` /
   `classify`) and, if relevant, a decoder. Otherwise add a `RegexRule` in
   `src/detect.ts`.
2. Document it in `src/rules.ts` (`RULES`) — this drives `explain`, SARIF metadata,
   and the README table.
3. Add tests: a positive detection, a false-positive guard, and byte-offset accuracy.
4. Update the README rules table and `CHANGELOG.md`.

## Regenerating example fixtures

```bash
node examples/make-examples.mjs
```

Keep payloads obviously fake (`evil.example`, placeholder paths). The examples
demonstrate detection, not a working attack.
