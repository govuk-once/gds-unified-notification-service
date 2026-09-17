import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const path = `/notifications`;
describe('GET {{flex}}/notifications', () => {
  describe(`Unhappy paths`, () => {
    test('ECONNREFUSED/UND_ERR_CONNECT_TIMEOUT when - attempting to use insecure protocol (http instead of https)', async ({
      flexAPIUsingInsecureProtocol: api,
    }) => {
      // Act & Assert
      try {
        await api.get({ path });
        expect(true).toBeFalsy();
      } catch (error) {
        // Handle private and public
        if (api.isPrivateGateway()) {
          expect(error).toMatchObject({
            message: 'fetch failed',
            cause: expect.objectContaining({
              code: 'UND_ERR_CONNECT_TIMEOUT',
              name: 'ConnectTimeoutError',
            }),
          });
        } else {
          expect(error).toMatchObject({
            message: 'fetch failed',
            cause: expect.objectContaining({
              code: 'ECONNREFUSED',
            }),
          });
        }
      }
    });

    test('status 403 when - using invalid api key', async ({ flexAPIWithoutAPIKey: api }) => {
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow('API [GET] /notifications Failed with 403');
    });

    test('status 400 when -  missing pushID', async ({ flexAPI: api }) => {
      await expect(api.get({ path })).rejects.toThrow('API [GET] /notifications Failed with 400');
    });
  });

  describe(`Happy paths`, () => {
    test('status 200 when - accessing list of notifications', async ({ flexAPI: api, pushID }) => {
      // Act
      const { status, body } = await api.get({ path: `${path}?pushID=${pushID}` });

      // Assert
      expect(status).toEqual(200);
      expect(body).toEqual([]);
    });
  });
});
