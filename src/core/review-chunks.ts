import { countLines, isUnifiedDiff } from './diff-lines.js';
import { ValidationError } from './errors.js';

export interface DiffChunks {
  readonly chunks: readonly string[];
  readonly totalLines: number;
  readonly reviewedLines: number;
}

export function splitUnifiedDiffHunks(diff: string): readonly string[] {
  const lines = diff.split('\n');
  const hunks: string[] = [];
  let header: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length === 0) {
      return;
    }
    hunks.push([...header, ...current].join('\n'));
    current = [];
  };

  for (const line of lines) {
    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      if (current.length > 0) {
        flush();
        header = [];
      }
      header.push(line);
      continue;
    }
    if (line.startsWith('@@')) {
      flush();
      current = [line];
      continue;
    }
    if (current.length > 0 || header.length > 0) {
      if (current.length === 0) {
        current = [line];
      } else {
        current.push(line);
      }
    }
  }
  flush();
  return hunks.length > 0 ? hunks : [diff];
}

export function chunkDiff(diff: string, maxDiffLines: number): DiffChunks {
  if (maxDiffLines < 1) {
    throw new ValidationError('maxDiffLines must be a positive number');
  }

  const totalLines = countLines(diff);
  if (totalLines === 0) {
    return { chunks: [], totalLines: 0, reviewedLines: 0 };
  }

  const units = isUnifiedDiff(diff)
    ? [...splitUnifiedDiffHunks(diff)]
    : windowPlainLines(diff, maxDiffLines);

  const chunks: string[] = [];
  let bucket: string[] = [];
  let bucketLines = 0;

  const flushBucket = (): void => {
    if (bucket.length === 0) {
      return;
    }
    chunks.push(bucket.join('\n'));
    bucket = [];
    bucketLines = 0;
  };

  for (const unit of units) {
    const unitLines = countLines(unit);
    if (unitLines > maxDiffLines) {
      throw new ValidationError(
        `Diff hunk exceeds maxDiffLines (${unitLines} > ${maxDiffLines}). Fail-closed without truncating. Reviewed lines: 0/${totalLines}`,
      );
    }
    if (bucketLines + unitLines > maxDiffLines) {
      flushBucket();
    }
    bucket.push(unit);
    bucketLines += unitLines;
  }
  flushBucket();

  const reviewedLines = chunks.reduce((sum, chunk) => sum + countLines(chunk), 0);
  return { chunks, totalLines, reviewedLines };
}

function windowPlainLines(text: string, maxDiffLines: number): readonly string[] {
  const lines = text.split('\n');
  const windows: string[] = [];
  for (let index = 0; index < lines.length; index += maxDiffLines) {
    windows.push(lines.slice(index, index + maxDiffLines).join('\n'));
  }
  return windows;
}
