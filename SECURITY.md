# Security Policy

rulesentry parses **untrusted input** by design (it scans potentially malicious
agent-config files). If you find a way to make rulesentry hang, crash, exhaust
memory, or emit attacker-controlled terminal escape sequences on crafted input,
that is a security issue.

## Reporting

Please report vulnerabilities privately via GitHub Security Advisories
("Report a vulnerability" on the repository's Security tab) rather than a public
issue. Include a minimal reproducing input where possible.

## Scope

- Denial of service on crafted input (ReDoS, memory blow-up, pathological files).
- Terminal/output injection via crafted filenames or decoded payloads.
- Any code execution (rulesentry never executes scanned content — it only reads it).

## Non-scope

- False positives / false negatives in detection are bugs, not vulnerabilities —
  file a normal issue with the sample.
