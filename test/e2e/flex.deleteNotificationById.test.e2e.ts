import { isCI, test } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const url = (notificationID: string, pushID?: string) =>
  `/notifications/${notificationID}${pushID ? `?pushID=${pushID}` : ''}`;

describe('DELETE {{flex}}/notifications/{{notificationID}} - Delete notification', () => {
  describe(`Unhappy paths`, () => {
    test.runIf(isCI)(
      'ECONNREFUSED/UND_ERR_CONNECT_TIMEOUT when - attempting to use insecure protocol (http instead of https)',
      async ({ flexAPIUsingInsecureProtocol: api, mockNotificationID, insecureProtocolError }) => {
        // Arrange
        const path = url(mockNotificationID.valid);

        // Act
        const result = api.delete({ path });

        // Assert
        await expect(result).rejects.toMatchObject(insecureProtocolError);
      }
    );

    test('status 403 when - using invalid api key', async ({ flexAPIWithoutAPIKey: api, mockNotificationID }) => {
      // Arrange
      const path = url(mockNotificationID.valid);

      // Act & Assert
      await expect(
        api.delete({
          path,
        })
      ).rejects.toThrow(`API [DELETE] ${path} Failed with 403`);
    });

    test('status 400 when -  missing pushID', async ({ flexAPI: api, mockNotificationID }) => {
      // Arrange
      const path = url(mockNotificationID.notFound);

      // Act & Assert
      await expect(
        api.delete({
          path,
        })
      ).rejects.toThrow(`API [DELETE] ${path} Failed with 400`);
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
        api.delete({
          path,
        })
      ).rejects.toThrow(`API [DELETE] ${path} Failed with 404`);
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
        api.delete({
          path,
        })
      ).rejects.toThrow(`API [DELETE] ${path} Failed with 404`);
    });
  });
});
