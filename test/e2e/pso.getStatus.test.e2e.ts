import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const url = () => `/status`;

describe('Get /status', () => {
  describe(`Unhappy paths`, () => {
    test('transport error when - attempting to use insecure protocol (http instead of https)', async ({
      psoAPIUsingInsecureProtocol: api,
    }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toSatisfy(
        (err) => err instanceof Error && (err.name === 'FetchTimeoutError' || err.message === 'fetch failed')
      );
    });

    test('transport error when - missing MTLS certificate', async ({ psoAPIWithoutMTLSCert: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toSatisfy(
        (err) => err instanceof Error && (err.name === 'FetchTimeoutError' || err.message === 'fetch failed')
      );
    });

    test('status 401 when - using invalid api key', async ({ psoAPIWithoutAPIKey: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 401`);
    });
  });

  describe(`Happy paths`, () => {
    test('status 200 when - the status endpoint is called with correct credentials', async ({ psoAPI }) => {
      // Act
      const result = await psoAPI.get({ path: '/status' });

      // Assert
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ status: 'ok' });
    });
  });
});
