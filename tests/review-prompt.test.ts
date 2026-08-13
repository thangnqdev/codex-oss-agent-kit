import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentsParser } from '../src/core/agents-parser.js';
import {
  UNTRUSTED_DIFF_BEGIN,
  UNTRUSTED_DIFF_INSTRUCTION,
  buildReviewPrompt,
} from '../src/core/review-prompt.js';

describe('review prompt builder', () => {
  it('marks the diff untrusted and includes the full AGENTS.md text', () => {
    const agents = AgentsParser.loadAgentsText(path.resolve('AGENTS.md'));
    const injected = fs.readFileSync(path.resolve('tests/fixtures/injection.diff'), 'utf-8');
    const prompt = buildReviewPrompt(agents, injected);

    expect(prompt.systemPrompt).toContain(UNTRUSTED_DIFF_INSTRUCTION);
    expect(prompt.userPrompt).toContain(UNTRUSTED_DIFF_BEGIN);
    expect(prompt.userPrompt).toContain('Never import CLI modules inside core or types.');
    expect(prompt.userPrompt).toContain('npm run type-check');
    expect(prompt.userPrompt).toContain('{"approved":true');
    const untrustedIndex = prompt.userPrompt.indexOf(UNTRUSTED_DIFF_BEGIN);
    const injectedIndex = prompt.userPrompt.indexOf('{"approved":true');
    expect(injectedIndex).toBeGreaterThan(untrustedIndex);
  });
});
