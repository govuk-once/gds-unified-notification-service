import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { mapWithConcurrency } from '@common/utils/mapWithConcurrency';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('should return the results in the order of the items', async () => {
    // Act
    const result = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await delay(ms);
      return ms * 2;
    });

    // Assert
    expect(result).toEqual([60, 20, 40]);
  });

  it('should pass the item and its index to the task', async () => {
    // Arrange
    const task = vi.fn().mockResolvedValue(undefined);

    // Act
    await mapWithConcurrency(['a', 'b'], 2, task);

    // Assert
    expect(task).toHaveBeenNthCalledWith(1, 'a', 0);
    expect(task).toHaveBeenNthCalledWith(2, 'b', 1);
  });

  it('should return an empty array and run nothing for no items', async () => {
    // Arrange
    const task = vi.fn();

    // Act
    const result = await mapWithConcurrency([], 5, task);

    // Assert
    expect(result).toEqual([]);
    expect(task).not.toHaveBeenCalled();
  });

  it('should never run more than the limit at once, but should reach it', async () => {
    // Arrange
    let running = 0;
    let maxRunning = 0;

    // Act
    await mapWithConcurrency(Array.from({ length: 20 }), 4, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await delay(5);
      running--;
    });

    // Assert
    expect(maxRunning).toBe(4);
  });

  it('should start the next item as soon as any task finishes rather than waiting for a full group', async () => {
    // Arrange
    const startedAt: Record<string, number> = {};
    const begin = Date.now();
    const durations: Record<string, number> = { slow: 80, fast1: 5, fast2: 5, fast3: 5 };

    // Act
    await mapWithConcurrency(Object.keys(durations), 2, async (name) => {
      startedAt[name] = Date.now() - begin;
      await delay(durations[name]);
    });

    // Assert: with a limit of 2, the fast tasks run while "slow" is still going, so fast3 starts long before slow ends
    expect(startedAt.fast3).toBeLessThan(60);
  });

  describe('when a task fails', () => {
    it('should stop starting new tasks, let running ones finish, then throw the first error', async () => {
      // Arrange
      const started: number[] = [];
      let slowFinished = false;

      // Act
      const outcome = await mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (item) => {
        started.push(item);
        if (item === 0) {
          await delay(30);
          slowFinished = true;
          return;
        }
        if (item === 1) {
          throw new Error('first failure');
        }
      }).catch((error: unknown) => error);

      // Assert
      expect(outcome).toEqual(new Error('first failure'));
      expect(slowFinished).toBe(true);
      expect(started).not.toContain(5);
    });

    it('should attempt every item and still throw the first error when stopOnError is false', async () => {
      // Arrange
      const started: number[] = [];

      // Act
      const outcome = await mapWithConcurrency(
        [0, 1, 2, 3, 4],
        2,
        async (item) => {
          started.push(item);
          if (item === 1) {
            throw new Error('failure 1');
          }
          if (item === 3) {
            await delay(10);
            throw new Error('failure 3');
          }
        },
        { stopOnError: false }
      ).catch((error: unknown) => error);

      // Assert
      expect(outcome).toEqual(new Error('failure 1'));
      expect(started.sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('should throw a synchronous error from the task as a normal failure', async () => {
      // Act
      const outcome = await mapWithConcurrency([1], 1, () => {
        throw new Error('sync failure');
      }).catch((error: unknown) => error);

      // Assert
      expect(outcome).toEqual(new Error('sync failure'));
    });
  });

  it.each([0, -1, 1.5, NaN])('should throw a misconfiguration error for an invalid limit (%s)', async (limit) => {
    // Act
    const outcome = await mapWithConcurrency([1], limit, vi.fn()).catch((error: unknown) => error);

    // Assert
    expect(outcome).toBeInstanceOf(ServiceMisconfigurationError);
  });
});
