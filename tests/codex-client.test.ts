import { describe, it, expect } from 'vitest';
import { CodexClient } from '../src/core/codex-client.js';

describe('CodexClient', () => {
  it('initializes with default options and mock mode', () => {
    const client = new CodexClient({ mockMode: true });
    expect(client.getModel()).toBe('gpt-4o');
    expect(client.isMockMode()).toBe(true);
  });

  it('generates mock completion for diff review', async () => {
    const client = new CodexClient({ mockMode: true });
    const response = await client.generateCompletion('review diff changes');
    expect(response).toContain('approved');
    expect(response).toContain('95');
  });

  it('generates mock completion for issue triage', async () => {
    const client = new CodexClient({ mockMode: true });
    const response = await client.generateCompletion('triage issue bug report');
    expect(response).toContain('category');
    expect(response).toContain('bug');
  });

  it('generates mock completion for security audit', async () => {
    const client = new CodexClient({ mockMode: true });
    const response = await client.generateCompletion('audit security findings');
    expect(response).toContain('passed');
  });

  it('generates default mock response for unknown prompt', async () => {
    const client = new CodexClient({ mockMode: true });
    const response = await client.generateCompletion('random prompt');
    expect(response).toBe('Mock Codex Completion Response');
  });
});
