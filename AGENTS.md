# Repository Instructions for AI Agents & Developers

This repository follows an internal architecture, coding, testing, and security contract for human maintainers and AI coding agents. These rules are repository policy, not an official OpenAI program standard.

---

## 1. Architectural Contract & Directory Boundaries

- `src/core/`: Contains pure business logic, analyzers, and OpenAI Codex integrations. Must remain framework-agnostic.
- `src/cli/`: Command-line entry points and interactive subcommands.
- `src/types/`: Shared TypeScript data models, contracts, and interfaces.
- `tests/`: Vitest test specifications matching 1-to-1 with core modules.

### Layer Dependency Direction

```
src/cli/ -> src/core/ -> src/types/
```

_Never import CLI modules inside core or types._

---

## 2. Coding & Quality Standards

- **TypeScript Strict Mode**: Zero `any` types permitted. All functions must declare explicit parameter types and return types. `noUncheckedIndexedAccess` is enabled; index access must be narrowed before use.
- **Lint & Format**: ESLint (typescript-eslint type-aware rules) and Prettier are enforced. `npm run lint` and `npm run format:check` must pass.
- **Immutability**: Prefer `readonly` arrays/objects for state representations.
- **Error Handling**: Use custom domain exceptions (`CodexApiError`, `ValidationError`, `SecurityAuditError`) rather than bare `throw new Error()`.
- **Async Safety**: Always wrap external network/API operations with timeout, retry, and clean failure handlers. Chunked review calls run with bounded concurrency (`mapWithConcurrency`), never unbounded fan-out.

---

## 3. Testing Contract

- **Test Suite**: Vitest (`npm run test`).
- **Coverage Floor**: 80% line, statement, branch, and function coverage minimum, enforced **per file** (`perFile: true`).
- **Determinism**: Mock external HTTP calls or OpenAI API requests using fakes/stubs in tests.

---

## 4. Completion & Quality Gate Criteria

Before submitting any PR or marking work complete:

1. `npm run type-check` must pass cleanly without errors.
2. `npm run lint` and `npm run format:check` must pass.
3. `npm run test` must pass with >=80% coverage per file.
4. `npm run build` must produce clean `dist/` JS bundles.
5. `SECURITY.md` guidelines must be satisfied (no exposed credentials or unsanitized inputs).
