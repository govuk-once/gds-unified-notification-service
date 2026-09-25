import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const url = (notificationID: string, pushID?: string) =>
  `/notifications/${notificationID}${pushID ? `/status?pushID=${pushID}` : '/status'}`;
const body = { Status: `READ` };

describe('PATCH {{flex}}/notifications/{{notificationID}} - Update notification status', () => {
  describe(`Unhappy paths`, () => {
    test('ECONNREFUSED/UND_ERR_CONNECT_TIMEOUT when - attempting to use insecure protocol (http instead of https)', async ({
      flexAPIUsingInsecureProtocol: api,
      mockNotificationID,
    }) => {
      // Arrange
      const path = url(mockNotificationID.valid);

      // Act
      const result = api.patch({
        path,
        body,
      });

      // Assert
      await expect(result).rejects.toMatchObject({
        message: 'fetch failed',
        cause: expect.objectContaining(
          api.isPrivateGateway() // Handle private & public api gateway
            ? { code: 'UND_ERR_CONNECT_TIMEOUT', name: 'ConnectTimeoutError' }
            : { code: 'ECONNREFUSED' }
        ),
      });
    });

    test('status 403 when using invalid api key', async ({ flexAPIWithoutAPIKey: api, mockNotificationID }) => {
      // Arrange
      const path = url(mockNotificationID.valid);

      // Act & Assert
      await expect(
        api.patch({
          path,
          body,
        })
      ).rejects.toThrow(`API [PATCH] ${path} Failed with 403`);
    });

    test('status 400 when -  missing pushID', async ({ flexAPI: api, mockNotificationID }) => {
      // Arrange
      const path = url(mockNotificationID.notFound);

      // Act & Assert
      await expect(
        api.patch({
          path,
          body,
        })
      ).rejects.toThrow(`API [PATCH] ${path} Failed with 400`);
    });

    test('status 404 when - accessing non existing notification', async ({
      flexAPI: api,
      pushID,
      mockNotificationID,
    }) => {
      // Arrange
      const path = url(mockNotificationID.notFound, pushID);

      // Act & Assert
      await expect(
        api.patch({
          path,
          body,
        })
      ).rejects.toThrow(`API [PATCH] ${path} Failed with 404`);
    });

    test('status 400 when when - missing body', async ({ flexAPI: api, pushID, mockNotificationID }) => {
      // Arrange
      const path = url(mockNotificationID.valid, pushID);
      // Act & Assert
      await expect(
        api.patch({
          path,
          body: {},
        })
      ).rejects.toThrow(`API [PATCH] ${path} Failed with 400`);
    });

    test('status 404 when when - attempting to update as NOT the owner', async ({
      flexAPI: api,
      pushID,
      mockNotificationID,
    }) => {
      // Arrange
      const path = url(mockNotificationID.valid, pushID);
      // Act & Assert
      await expect(
        api.patch({
          path,
          body: {
            Status: `READ`,
          },
        })
      ).rejects.toThrow(`API [PATCH] ${path} Failed with 404`);
    });
  });
});
