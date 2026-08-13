# Codex OSS Agent Kit

[![Codex for OSS](https://img.shields.io/badge/OpenAI-Codex%20for%20OSS-00A67E?style=for-the-badge&logo=openai)](https://developers.openai.com/community/codex-for-oss)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/thangnqdev/codex-oss-agent-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/thangnqdev/codex-oss-agent-kit/actions/workflows/ci.yml)

> An open-source maintainer toolkit and GitHub Action engine for OpenAI **Codex for Open Source** program compliance and automated repository triage.

---

## Overview

**`codex-oss-agent-kit`** gives maintainers a CLI that can:

1. **Review a pull request diff** against [`AGENTS.md`](./AGENTS.md) rules via the OpenAI Chat Completions API (or `--mock` for offline runs). The command prints an approval decision, score, summary, and rule findings. It does **not** post GitHub inline review comments.
2. **Triage an issue** by classifying category/complexity and recommending labels.
3. **Audit a source file** with static secret/unsafe-pattern checks (`sk-`, `sk-proj-`, `sk-svcacct-`, `ghp_`, `github_pat_`, `eval(`). This is a regex scanner, not an OWASP engine or dependency CVE audit.

Live review/triage calls use a request timeout, bounded retries on 429/5xx, and reject empty or non-JSON model output. Invalid review JSON fails closed (does not auto-approve).

---

## Key Features

- **Codex API client**: `gpt-4o` by default (override via `.codex/config.json` `reviewSettings.model`) with timeout, retry, and response validation.
- **`AGENTS.md` rules engine**: Parses repository agent guidelines and includes them in the review prompt.
- **Config that is actually applied**: `.codex/config.json` is deep-merged; `model`, `maxDiffLines`, and `securityAuditOnPR` change runtime behavior.
- **GitHub Actions**: CI (type-check, tests with an 80% coverage floor, build), optional PR review, and a security scan over `src/**`.
- **Type-safe core**: TypeScript strict mode. Tests run with Vitest and enforce 80% line/statement/branch/function coverage.

---

## Quick Start

### From a clone (development)

```bash
npm install
npm run build
node bin/codex-oss.js --help
```

`npm install` runs a `prepare` hook that builds `dist/` when TypeScript is available. `npm start` is `node bin/codex-oss.js` and requires that build.

### After publish

```bash
npm install -g codex-oss-agent-kit
codex-oss --help
```

Or:

```bash
npx codex-oss-agent-kit --help
```

Published packages include the compiled `dist/` tree (see the `files` allowlist). Local clones must build first.

### Environment Setup

Live review/triage requires a key:

```bash
export OPENAI_API_KEY="sk-..."
```

Alternatively pass `--api-key`. Without a key, pass `--mock` or the CLI exits non-zero. Audit is static and does not need a key.

---

## CLI Usage

Global flags: `--mock`, `--api-key <key>`, `--config <path>` (default `.codex/config.json`).

`--diff` (review) and `--file` (audit) are required and must be readable. Missing or unreadable paths exit non-zero. A rejected review or a failed audit (high/critical findings) also exits non-zero.

### 1. Review a Pull Request / Diff

```bash
codex-oss --mock review --diff path/to/feature.diff --agents AGENTS.md
codex-oss review --diff path/to/feature.diff --agents AGENTS.md
```

### 2. Triage an Issue

```bash
codex-oss --mock triage --title "Bug: App crashes on launch" --body "Steps to reproduce..."
```

### 3. Security Audit Code Files

```bash
codex-oss audit --file src/core/codex-client.ts
```

---

## Architecture

```
                       ┌────────────────────────────────┐
                       │    CLI Entry (src/cli/index)   │
                       └───────────────┬────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
   ┌─────────────────┐       ┌──────────────────┐       ┌──────────────────┐
   │   PR Analyzer   │       │  Issue Triager   │       │ Security Auditor │
   └────────┬────────┘       └────────┬─────────┘       │ (static patterns)│
            │                         │                 └──────────────────┘
            └─────────────────────────┼──────────────────────────┘
                                      ▼
                        ┌──────────────────────────┐
                        │       CodexClient        │
                        │ (OpenAI Chat Completions)│
                        └──────────────────────────┘
```

The library entry (`src/index.ts`) exports core + types only. The CLI is the `codex-oss` bin.

---

## OpenAI Codex for OSS Compliance Matrix

| Requirement | Status | Details |
|---|---|---|
| **OSI Approved License** | MIT License | Full open-source freedom |
| **Agent Instructions** | `AGENTS.md` | Standardized AI coding agent guidelines |
| **Automated Workflows** | GitHub Actions | CI, PR review, security scan over `src/**` |
| **Community Governance** | Present | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` |
| **Quality & Coverage** | Vitest | 80% coverage floor enforced in `npm test` |

---

## License

Distributed under the MIT License. See [`LICENSE`](./LICENSE) for details.
