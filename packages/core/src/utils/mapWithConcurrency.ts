import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';

export type MapWithConcurrencyOptions = {
  /**
   * When true (default) no new tasks are started once one has failed. When false every task is attempted regardless.
   * Either way, tasks already running are always allowed to finish before the first error is thrown.
   */
  stopOnError?: boolean;
};

/**
 * Runs `task` for every item with at most `limit` running at once. This is a rolling pool: as soon as one task finishes
 * the next item is started, rather than waiting for a whole group of `limit` tasks to complete.
 *
 * Results are returned in the same order as `items`. If any task fails, the first failure (by time) is thrown after all
 * running tasks have settled, so no work is left running unobserved once this returns.
 */
export const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
  { stopOnError = true }: MapWithConcurrencyOptions = {}
): Promise<R[]> => {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ServiceMisconfigurationError(['The concurrency limit is not a positive integer.']);
  }

  const results = new Array<R>(items.length);
  const errors: unknown[] = [];
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length && !(stopOnError && errors.length > 0)) {
      const index = nextIndex++;
      try {
        results[index] = await task(items[index], index);
      } catch (error) {
        errors.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));

  if (errors.length > 0) {
    throw errors[0];
  }
  return results;
};
