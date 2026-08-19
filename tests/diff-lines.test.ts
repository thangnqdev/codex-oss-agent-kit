import { describe, expect, it } from 'vitest';
import {
  addedContentFromUnifiedDiff,
  classifyUnifiedDiffLine,
  contentToAudit,
  isUnifiedDiff,
} from '../src/core/diff-lines.js';

describe('unified diff line classification', () => {
  it('detects unified diffs and classifies +, -, and headers', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      ' context',
    ].join('\n');

    expect(isUnifiedDiff(diff)).toBe(true);
    expect(classifyUnifiedDiffLine('+new')).toBe('added');
    expect(classifyUnifiedDiffLine('-old')).toBe('deleted');
    expect(classifyUnifiedDiffLine('+++ b/a.ts')).toBe('header');
    expect(addedContentFromUnifiedDiff(diff)).toBe('new');
    expect(contentToAudit(diff)).toBe('new');
  });

  it('classifies added lines whose content starts with ++ as added, not header', () => {
    // A file line "++i;" appears in the diff as "+++i;" and must stay auditable.
    expect(classifyUnifiedDiffLine('+++i;')).toBe('added');
    expect(classifyUnifiedDiffLine('---i;')).toBe('deleted');
    expect(classifyUnifiedDiffLine('+++ b/a.ts')).toBe('header');
    expect(classifyUnifiedDiffLine('--- a/a.ts')).toBe('header');
  });

  it('keeps added lines starting with ++ in the audited content', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -0,0 +1,1 @@',
      '+++const key = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";',
    ].join('\n');

    expect(addedContentFromUnifiedDiff(diff)).toBe(
      '++const key = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";',
    );
    expect(contentToAudit(diff)).toContain('sk-proj-');
  });

  it('scans raw source files in full', () => {
    expect(isUnifiedDiff('const x = 1;')).toBe(false);
    expect(contentToAudit('const SECRET = "x";')).toContain('SECRET');
  });
});
