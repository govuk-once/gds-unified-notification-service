import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const url = (notificationID: string, pushID?: string) =>
  `/notifications/${notificationID}${pushID ? `?pushID=${pushID}` : ''}`;

describe('DELETE {{flex}}/notifications/{{notificationID}} - Delete notification', () => {
  describe(`Unahppy paths`, () => {
    test('ECONNREFUSED when - attempting to use insecure protocol (http instead of https)', async ({
      flexAPIUsingInsecureProtocol: api,
      mockNotificationID,
    }) => {
      // Arrange
      const path = url(mockNotificationID.valid);

      // Act & Assert
      await expect(
        api.delete({
          path,
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: 'fetch failed',
          cause: expect.objectContaining({
            code: 'ECONNREFUSED',
          }),
        })
      );
    });

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
