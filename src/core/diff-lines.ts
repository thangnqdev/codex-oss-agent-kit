export type DiffLineKind = 'added' | 'deleted' | 'context' | 'header';

export interface ClassifiedDiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

export function isUnifiedDiff(content: string): boolean {
  return /(?:^|\n)(?:diff --git |@@ |\+\+\+ |--- )/m.test(content);
}

export function classifyUnifiedDiffLine(line: string): DiffLineKind {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('@@')) {
    return 'header';
  }
  if (line.startsWith('+')) {
    return 'added';
  }
  if (line.startsWith('-')) {
    return 'deleted';
  }
  return 'context';
}

export function classifyUnifiedDiff(content: string): readonly ClassifiedDiffLine[] {
  return content.split('\n').map((text) => ({
    kind: classifyUnifiedDiffLine(text),
    text,
  }));
}

export function addedContentFromUnifiedDiff(content: string): string {
  return classifyUnifiedDiff(content)
    .filter((line) => line.kind === 'added')
    .map((line) => line.text.slice(1))
    .join('\n');
}

export function contentToAudit(content: string): string {
  if (!isUnifiedDiff(content)) {
    return content;
  }
  return addedContentFromUnifiedDiff(content);
}

export function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return text.split('\n').length;
}
