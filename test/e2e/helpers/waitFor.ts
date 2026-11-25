export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (callback: () => Promise<void>, timeout: number, interval: number, label?: string) => {
  const startTime = Date.now();

  while (true) {
    try {
      await callback();
      return;
    } catch {
      if (Date.now() - startTime >= timeout) {
        throw new Error(`Timeout after ${timeout}ms${label ? ` for ${label}` : ''}`);
      }

      await sleep(interval);
    }
  }
};
