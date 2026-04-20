import { test } from '@test/e2e/setup.e2e.vitest';
import { expect } from 'vitest';

describe('Get /status', () => {
  test('returns 200 when calling the status endpoint', async ({ psoServer }) => {
    // Act
    const result = await psoServer.get('/status');

    // Assert
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ status: 'ok' });
  });
});
