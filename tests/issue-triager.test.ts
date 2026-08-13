import { describe, it, expect } from 'vitest';
import { IssueTriager } from '../src/core/issue-triager.js';
import { CodexClient } from '../src/core/codex-client.js';

describe('IssueTriager', () => {
  it('handles empty issue title and body', async () => {
    const client = new CodexClient({ mockMode: true });
    const triager = new IssueTriager(client);
    const result = await triager.triageIssue('', '');

    expect(result.category).toBe('question');
    expect(result.recommendedLabels).toContain('needs-info');
  });

  it('triages bug report issue', async () => {
    const client = new CodexClient({ mockMode: true });
    const triager = new IssueTriager(client);
    const result = await triager.triageIssue('Bug: app crashes', 'Steps to reproduce...');

    expect(result.category).toBe('bug');
    expect(result.recommendedLabels.length).toBeGreaterThan(0);
  });
});
