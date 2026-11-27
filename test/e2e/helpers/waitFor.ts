export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (callback: () => Promise<void>, timeout: number, interval: number, label?: string) => {
  const startTime = Date.now();
  let lastError: unknown;

  while (true) {
    try {
      await callback();
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() - startTime >= timeout) {
        const lastMessage = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`Timeout after ${timeout}ms${label ? ` for ${label}` : ''} - last error: ${lastMessage}`);
      }

      await sleep(interval);
    }
  }
};
