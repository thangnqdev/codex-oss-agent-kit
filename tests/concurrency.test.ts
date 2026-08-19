import { describe, expect, it } from 'vitest';
import { DEFAULT_REVIEW_CONCURRENCY, mapWithConcurrency } from '../src/core/concurrency.js';
import { ValidationError } from '../src/core/errors.js';

describe('mapWithConcurrency', () => {
  it('maps every item and preserves input order', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const results = await mapWithConcurrency(items, 3, async (item) => item * 2);
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it('never runs more workers than the limit', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, index) => index);

    await mapWithConcurrency(items, 3, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item;
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('runs sequentially when the limit is 1', async () => {
    let active = 0;
    let peak = 0;
    const items = [1, 2, 3];

    await mapWithConcurrency(items, 1, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return item;
    });

    expect(peak).toBe(1);
  });

  it('passes the item index to the worker', async () => {
    const seen: number[] = [];
    await mapWithConcurrency(['a', 'b', 'c'], 2, async (_item, index) => {
      seen.push(index);
      return index;
    });
    expect(seen.sort()).toEqual([0, 1, 2]);
  });

  it('returns an empty array for empty input', async () => {
    const results = await mapWithConcurrency([], 4, async (item: number) => item);
    expect(results).toEqual([]);
  });

  it('rejects invalid concurrency limits', async () => {
    await expect(mapWithConcurrency([1], 0, async (item) => item)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(mapWithConcurrency([1], -2, async (item) => item)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(mapWithConcurrency([1], 1.5, async (item) => item)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('propagates worker failures', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) {
          throw new Error('boom');
        }
        return item;
      }),
    ).rejects.toThrow('boom');
  });

  it('exposes a sane default concurrency', () => {
    expect(DEFAULT_REVIEW_CONCURRENCY).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(DEFAULT_REVIEW_CONCURRENCY)).toBe(true);
  });
});
