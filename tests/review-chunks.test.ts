import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunkDiff } from '../src/core/review-chunks.js';
import { ValidationError } from '../src/core/errors.js';

describe('diff chunking', () => {
  it('sends every line of an oversized multi-hunk diff across chunks', () => {
    const diff = fs.readFileSync(path.resolve('tests/fixtures/oversize.diff'), 'utf-8');
    const packed = chunkDiff(diff, 8);
    expect(packed.reviewedLines).toBe(packed.totalLines);
    expect(packed.chunks.length).toBeGreaterThan(1);
    const combined = packed.chunks.join('\n');
    expect(combined).toContain('export const a = 1;');
    expect(combined).toContain('export const d2 = 2;');
  });

  it('fail-closes when a single hunk is larger than the limit', () => {
    const hunk = ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -0,0 +1,6 @@', '+a', '+b', '+c', '+d', '+e', '+f'].join('\n');
    expect(() => chunkDiff(hunk, 4)).toThrow(ValidationError);
    expect(() => chunkDiff(hunk, 4)).toThrow(/Reviewed lines: 0\//);
  });

  it('windows a plain non-diff so no line is dropped', () => {
    const packed = chunkDiff('one\ntwo\nthree\nfour', 2);
    expect(packed.chunks).toHaveLength(2);
    expect(packed.reviewedLines).toBe(4);
    expect(packed.chunks.join('\n')).toContain('three');
  });
});
