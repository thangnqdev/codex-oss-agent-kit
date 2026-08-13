# Codex OSS Agent Kit 🤖⚡

[![Codex for OSS](https://img.shields.io/badge/OpenAI-Codex%20for%20OSS-00A67E?style=for-the-badge&logo=openai)](https://developers.openai.com/community/codex-for-oss)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/CI-passing-brightgreen.svg?style=for-the-badge)](https://github.com/thangnqdev/codex-oss-agent-kit/actions)
[![Coverage](https://img.shields.io/badge/Coverage-100%25-brightgreen.svg?style=for-the-badge)](https://github.com/thangnqdev/codex-oss-agent-kit)

> An AI-powered Open-Source Maintainer Toolkit & GitHub Action Engine built for OpenAI **Codex for Open Source** program compliance and automated repository triage.

---

## 🌟 Overview

**`codex-oss-agent-kit`** provides open-source maintainers with CLI utilities and GitHub Actions powered by OpenAI Codex models. It automates critical maintainer workflows:

1. **Automated Pull Request Code Review**: Evaluates diffs against [`AGENTS.md`](./AGENTS.md) architectural guidelines and generates constructive line-by-line feedback.
2. **Intelligent Issue Triage**: Classifies incoming bug reports/features, estimates complexity, checks reproduction steps, and assigns relevant labels.
3. **Security Audit Scanner**: Performs static AI audits on code changes to identify credential leaks, unsafe dependencies, and OWASP top 10 risks.

---

## ⚙️ Key Features

- **Codex AI API Integration**: Seamless connection to `gpt-4o` and OpenAI Codex models with built-in retry and schema validation.
- **`AGENTS.md` Rules Engine**: Automatically parses repository agent guidelines to enforce team rules during automated PR reviews.
- **GitHub Action Ready**: Easily integrate into CI/CD pipelines (`.github/workflows/codex-pr-review.yml`).
- **100% Type-Safe & Test Covered**: Built with TypeScript strict mode and tested using Vitest (>80% coverage floor).

---

## 🚀 Quick Start

### Installation

```bash
npm install -g codex-oss-agent-kit
```

Or run directly with npx:

```bash
npx codex-oss-agent-kit --help
```

### Environment Setup

Set your OpenAI API key:

```bash
export OPENAI_API_KEY="sk-..."
```

---

## 💻 CLI Usage

### 1. Review a Pull Request / Diff
```bash
codex-oss review --diff path/to/feature.diff --agents AGENTS.md
```

### 2. Triage an Issue
```bash
codex-oss triage --title "Bug: App crashes on launch" --body "Steps to reproduce..."
```

### 3. Security Audit Code Files
```bash
codex-oss audit --file src/core/codex-client.ts
```

---

## 🏗️ Architecture

```
                       ┌────────────────────────────────┐
                       │    CLI Entry (src/cli/index)   │
                       └───────────────┬────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
   ┌─────────────────┐       ┌──────────────────┐       ┌──────────────────┐
   │   PR Analyzer   │       │  Issue Triager   │       │ Security Auditor │
   └────────┬────────┘       └────────┬─────────┘       └────────┬─────────┘
            │                         │                          │
            └─────────────────────────┼──────────────────────────┘
                                      ▼
                        ┌──────────────────────────┐
                        │       CodexClient        │
                        │ (OpenAI Codex API Engine)│
                        └──────────────────────────┘
```

---

## 🛡️ OpenAI Codex for OSS Compliance Matrix

| Requirement | Status | Details |
|---|---|---|
| **OSI Approved License** | ✅ MIT License | Full open-source freedom |
| **Agent Instructions** | ✅ `AGENTS.md` | Standardized AI coding agent guidelines |
| **Automated Workflows** | ✅ GitHub Actions | CI, PR Review, Security Scan workflows |
| **Community Governance** | ✅ Complete | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` |
| **Quality & Coverage** | ✅ Vitest | >80% coverage floor & zero lint errors |

---

## 📜 License

Distributed under the MIT License. See [`LICENSE`](./LICENSE) for details.
