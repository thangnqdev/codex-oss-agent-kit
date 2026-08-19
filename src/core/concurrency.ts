import { ValidationError } from './errors.js';

export const DEFAULT_REVIEW_CONCURRENCY = 4;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError('Concurrency limit must be a positive integer');
  }

  const results: R[] = new Array<R>(items.length);
  let cursor = 0;

  const runNext = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) {
        throw new ValidationError('Work item was missing during concurrent review');
      }
      results[index] = await worker(item, index);
    }
  };

  const workerCount = Math.min(limit, items.length);
  const workers: Array<Promise<void>> = [];
  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    workers.push(runNext());
  }
  await Promise.all(workers);
  return results;
}
