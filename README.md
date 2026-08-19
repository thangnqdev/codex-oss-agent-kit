# Codex OSS Agent Kit

[![Codex for OSS](https://img.shields.io/badge/OpenAI-Codex%20for%20OSS-00A67E?style=for-the-badge&logo=openai)](https://developers.openai.com/community/codex-for-oss)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/thangnqdev/codex-oss-agent-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/thangnqdev/codex-oss-agent-kit/actions/workflows/ci.yml)

> An open-source maintainer toolkit and drop-in GitHub Action for PR review, issue triage, and static secret scanning. Ready to plug into Codex-style maintainer workflows.

The [OpenAI Codex for Open Source](https://developers.openai.com/community/codex-for-oss) program supports core maintainers of widely used public projects (product access and credits). This repository is **not** an official compliance kit for that program.

---

## Overview

**`codex-oss-agent-kit`** gives maintainers a CLI and a reusable GitHub Action that can:

1. **Review a pull request diff** against the full [`AGENTS.md`](./AGENTS.md) text via the **OpenAI Responses API** (default model `gpt-5.6`) with a structured JSON schema. The command prints an approval **signal**, score, summary, and `Reviewed lines: N/M`. It does **not** post GitHub inline review comments. The AI verdict is a signal, not the only pass/fail authority.
2. **Triage an issue** by classifying category/complexity and recommending labels.
3. **Audit a source file or unified diff** with static secret/unsafe-pattern checks (`sk-`, `sk-proj-`, `sk-svcacct-`, `ghp_`, `github_pat_`, `eval(`). Unified diffs are scanned on **added (`+`) lines only**. This is a regex scanner, not an OWASP engine or dependency CVE audit.

Live review/triage calls use a request timeout, bounded retries on 429/5xx, and structured outputs. Invalid or empty model JSON fails closed (does not auto-approve). Diffs larger than `maxDiffLines` are chunked so every line is reviewed, or the run fail-closes if a single hunk cannot fit. Chunks are reviewed with bounded concurrency (default 4 in flight) to keep large PRs fast without unbounded API fan-out. Diff text is treated as **untrusted data**.

`--mock` is for local development only. CI and the drop-in Action never mock-approve when the API key is missing; they print `AI review: SKIPPED`.

---

## Key Features

- **Responses API client**: `gpt-5.6` by default (override via `.codex/config.json` `reviewSettings.model` or `--model`) with timeout, retry, and a JSON schema on the request.
- **Full `AGENTS.md`**: The reviewer receives the entire file, including numbered quality-gate lines and prose rules.
- **Config that is actually applied**: `.codex/config.json` is deep-merged; `model`, `maxDiffLines`, and `securityAuditOnPR` change runtime behavior. The config schema only contains keys that affect behavior.
- **Drop-in GitHub Action**: `uses: thangnqdev/codex-oss-agent-kit@main` with inputs `openai-api-key`, `model`, `agents-file`, `max-diff-size` and outputs `approved`, `score`, `findings`.
- **Type-safe core**: TypeScript strict mode with `noUncheckedIndexedAccess`. Tests run with Vitest and enforce 80% line/statement/branch/function coverage **per file**. ESLint (type-aware) and Prettier are enforced in CI.

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

### Environment Setup

Live review/triage requires a key:

```bash
export OPENAI_API_KEY="sk-..."
```

Alternatively pass `--api-key`. Without a key, pass `--mock` for a local dry-run or the CLI exits non-zero. Audit is static and does not need a key.

---

## CLI Usage

Global flags: `--mock`, `--api-key <key>`, `--config <path>`, `--model <id>`, `--max-diff-lines <n>`, `--format text|json`.

`--diff` (review) and `--file` (audit) are required and must be readable. Missing or unreadable paths exit non-zero. A rejected review, an over-limit hunk, or a failed audit (high/critical findings on added lines) also exits non-zero.

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

## Drop-in GitHub Action

```yaml
name: PR review
on: pull_request
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: thangnqdev/codex-oss-agent-kit@main
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          model: gpt-5.6
          agents-file: AGENTS.md
          max-diff-size: '1000'
```

If `openai-api-key` is empty (typical for fork PRs, where repository secrets are not available), the Action prints `AI review: SKIPPED` and sets `approved=false`. That is not a mock pass.

---

## Architecture

```
                       ┌────────────────────────────────┐
                       │    CLI / Action (src/cli)      │
                       └───────────────┬────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
   ┌─────────────────┐       ┌──────────────────┐       ┌──────────────────┐
   │   PR Analyzer   │       │  Issue Triager   │       │ Security Auditor │
   └────────┬────────┘       └────────┬─────────┘       │ (+ lines of diffs)│
            │                         │                 └──────────────────┘
            └─────────────────────────┼──────────────────────────┘
                                      ▼
                        ┌──────────────────────────┐
                        │       CodexClient        │
                        │   OpenAI Responses API   │
                        └──────────────────────────┘
```

The library entry (`src/index.ts`) exports core + types only. The CLI is the `codex-oss` bin.

---

## Repository readiness / quality checklist for Codex workflows

This is a **self-imposed readiness checklist** for running Codex-style maintainer workflows in this repo. It is **not** an official OpenAI “Codex for OSS compliance” standard.

| Check                    | Status                     | Details                                                                                                             |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **OSI approved license** | MIT License                | Redistributable open source                                                                                         |
| **Agent instructions**   | `AGENTS.md`                | Full file is sent to the reviewer                                                                                   |
| **Automated workflows**  | GitHub Actions             | CI, drop-in PR review Action, security scan over `src/**`                                                           |
| **Community docs**       | Present                    | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`                                                              |
| **Quality & coverage**   | Vitest + ESLint + Prettier | 80% per-file coverage floor, type-aware lint, and format checks in `npm test`/`npm run lint`/`npm run format:check` |

---

## License

Distributed under the MIT License. See [`LICENSE`](./LICENSE) for details.
