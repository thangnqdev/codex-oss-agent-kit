import { describe, it, expect } from 'vitest';
import { PRAnalyzer } from '../src/core/pr-analyzer.js';
import { CodexClient } from '../src/core/codex-client.js';

describe('PRAnalyzer', () => {
  it('handles empty diff gracefully', async () => {
    const client = new CodexClient({ mockMode: true });
    const analyzer = new PRAnalyzer(client);
    const result = await analyzer.analyzeDiff('');

    expect(result.approved).toBe(true);
    expect(result.score).toBe(100);
    expect(result.summary).toContain('Empty diff');
  });

  it('analyzes non-empty diff using CodexClient', async () => {
    const client = new CodexClient({ mockMode: true });
    const analyzer = new PRAnalyzer(client);
    const result = await analyzer.analyzeDiff('+ const x = 1;', ['Enforce strict types']);

    expect(result.approved).toBe(true);
    expect(result.score).toBe(95);
    expect(result.summary).toBeDefined();
  });
});
