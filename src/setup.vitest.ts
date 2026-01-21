import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { handlers } from './_unittesthttpmocks';

// Conditionally enable MSW - it will intercept all http/s requests and allow easier unit testing of 3rd party services
if (process.env.VITEST_DISABLE_MSW == undefined || process.env.VITEST_DISABLE_MSW == 'false') {
  const server = setupServer(...handlers);
  beforeAll(() =>
    server.listen({
      // This tells MSW to throw an error whenever it
      // encounters a request that doesn't have a
      // matching request handler.
      onUnhandledRequest: 'error',
    })
  );
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
