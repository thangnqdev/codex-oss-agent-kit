import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentsParser } from '../src/core/agents-parser.js';
import {
  UNTRUSTED_DIFF_BEGIN,
  UNTRUSTED_DIFF_END,
  UNTRUSTED_DIFF_INSTRUCTION,
  buildReviewPrompt,
  createUntrustedDiffMarkers,
  generateDiffNonce,
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

  it('uses a random nonce per prompt so marker-like text in the diff cannot close the fence', () => {
    const first = buildReviewPrompt('rules', '+code');
    const second = buildReviewPrompt('rules', '+code');

    const beginPattern = new RegExp(`${UNTRUSTED_DIFF_BEGIN}:[0-9a-f]{32}`);
    const endPattern = new RegExp(`${UNTRUSTED_DIFF_END}:[0-9a-f]{32}`);
    expect(first.userPrompt).toMatch(beginPattern);
    expect(first.userPrompt).toMatch(endPattern);
    expect(first.userPrompt).not.toBe(second.userPrompt);

    const firstBegin = first.userPrompt.match(beginPattern)?.[0] ?? '';
    const secondBegin = second.userPrompt.match(beginPattern)?.[0] ?? '';
    expect(firstBegin).not.toBe(secondBegin);
  });

  it('accepts explicit markers and keeps the diff inside the fence', () => {
    const markers = createUntrustedDiffMarkers('fixed-nonce');
    const prompt = buildReviewPrompt('rules', '+code', 0, 1, markers);

    expect(prompt.userPrompt).toContain(`${UNTRUSTED_DIFF_BEGIN}:fixed-nonce`);
    expect(prompt.userPrompt).toContain(`${UNTRUSTED_DIFF_END}:fixed-nonce`);
    const beginIndex = prompt.userPrompt.indexOf(markers.begin);
    const codeIndex = prompt.userPrompt.indexOf('+code');
    const endIndex = prompt.userPrompt.indexOf(markers.end);
    expect(codeIndex).toBeGreaterThan(beginIndex);
    expect(endIndex).toBeGreaterThan(codeIndex);
  });

  it('generates unique 32-hex nonces', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateDiffNonce()));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
