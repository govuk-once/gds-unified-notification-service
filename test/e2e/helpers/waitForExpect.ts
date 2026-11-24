import CustomWorld from '@test/e2e/support/world';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForExpect = async (
  world: CustomWorld,
  callback: () => Promise<void>,
  timeout: number,
  interval: number
) => {
  const startTime = Date.now();

  while (true) {
    try {
      await callback();
      return;
    } catch {
      if (Date.now() - startTime >= timeout) {
        throw new Error(`Timeout after ${timeout}ms for path ${world.path}`);
      }

      await sleep(interval);
    }
  }
};
