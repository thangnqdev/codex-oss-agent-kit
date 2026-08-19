# Contributing to Codex OSS Agent Kit

Thank you for your interest in contributing to **Codex OSS Agent Kit**! This project is aligned with the **OpenAI Codex for Open Source** program.

## Development Workflow

1. **Fork and Clone**

   ```bash
   git clone https://github.com/thangnqdev/codex-oss-agent-kit.git
   cd codex-oss-agent-kit
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Run Type-Checks & Tests**

   ```bash
   npm run type-check
   npm run test
   ```

4. **Build the Project**
   ```bash
   npm run build
   ```

## Pull Request Guidelines

- Ensure your code passes all quality checks (`npm run build && npm run test`).
- Maintain at least 80% line coverage for new features.
- Follow the rules defined in [`AGENTS.md`](./AGENTS.md).
- Keep PRs focused and well-documented.
