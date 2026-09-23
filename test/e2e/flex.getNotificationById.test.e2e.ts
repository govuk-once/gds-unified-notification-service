import { iocGetNotificationDynamoRepository } from '@common/ioc';
import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { mockIMessageRecord_E2E } from '@test/mocks';
import { expect } from 'vitest';

const url = (notificationID: string, pushID?: string) =>
  `/notifications/${notificationID}${pushID ? `?pushID=${pushID}` : ''}`;

const createNotificationIfNotFound = async (notificationID: string, pushID: string) => {
  const notificationsRepository = await iocGetNotificationDynamoRepository();
  const message = await notificationsRepository.getRecord(notificationID);

  if (message === null) {
    console.log('No message record found, creating a new message in message table');
    const messageRecord = mockIMessageRecord_E2E(notificationID, pushID);
    await notificationsRepository.createRecord(messageRecord);
  }
};

describe('GET {{flex}}/notifications/{{notificationID}}', () => {
  describe(`Unhappy paths`, () => {
    test('ECONNREFUSED/UND_ERR_CONNECT_TIMEOUT when - attempting to use insecure protocol (http instead of https)', async ({
      flexAPIUsingInsecureProtocol: api,
      mockNotificationID,
    }) => {
      // Arrange
      const path = url(mockNotificationID.valid);

      // Act & Assert
      try {
        await api.get({ path });
        expect(true).toBeFalsy();
      } catch (error) {
        // Handle private and public
        expect(error).toMatchObject({
          message: 'fetch failed',
          cause: expect.objectContaining(
            api.isPrivateGateway()
              ? { code: 'UND_ERR_CONNECT_TIMEOUT', name: 'ConnectTimeoutError' }
              : { code: 'ECONNREFUSED' }
          ),
        });
      }
    });

    test('status 403 when using invalid api key', async ({ flexAPIWithoutAPIKey: api, mockNotificationID }) => {
      // Arrange
      const path = url(mockNotificationID.valid);

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 403`);
    });

    test('status 400 when -  missing pushID', async ({ flexAPI: api, mockNotificationID }) => {
      // Arrange
      const path = url(mockNotificationID.valid);

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 400`);
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
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 404`);
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
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 404`);
    });

    test('status 404 when when - accessing notification as NOT the owner', async ({
      flexAPI: api,
      pushID,
      mockNotificationID,
    }) => {
      // Arrange
      const path = url(mockNotificationID.valid, pushID);
      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 404`);
    });
  });

  describe(`Happy paths`, () => {
    test('status 200 when - accessing notification as the owner', async ({
      flexAPI: api,
      validPushID,
      mockNotificationID,
    }) => {
      // Arrange
      await createNotificationIfNotFound(mockNotificationID.valid, validPushID);
      const path = url(mockNotificationID.valid, validPushID);

      // Act
      const { status, body } = await api.get({
        path,
      });

      // Assert
      expect(status).toEqual(200);
      expect(body).toEqual(expect.objectContaining({ NotificationID: mockNotificationID.valid }));
    });
  });
});
