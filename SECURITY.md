# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of `codex-oss-agent-kit` seriously.

If you discover a security vulnerability, please do NOT open a public GitHub issue. Instead, report it directly by emailing security@thangnqdev.com or opening a Private Security Advisory on GitHub.

### Response Timeline

- **Acknowledgement**: Within 24 hours.
- **Assessment & Triage**: Within 48 hours.
- **Fix & Advisory Release**: Within 7 business days.

## Automated Security Audits

This repository runs `codex-oss audit` in GitHub Actions over tracked `src/**` TypeScript files. The scanner looks for hardcoded credential shapes (including `sk-`, `sk-proj-`, `sk-svcacct-`, `ghp_`, and `github_pat_`) and `eval(` usage. High and critical findings fail the job.

This is a static pattern check. It is not an OWASP Top 10 engine, a dependency CVE scanner, or a substitute for `npm audit`.
