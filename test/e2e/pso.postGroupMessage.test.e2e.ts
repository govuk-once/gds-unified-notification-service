import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const url = () => `/v1/send-to-group`;
const mockGroupMessage = {
  Namespace: 'test',
  Group: 'end2end',
  Subgroup: 'immediate',
  GroupNotificationID: 'TO_GROUP_ID',
  CampaignID: 'CAM_ID',
  MessageTitle: 'You have a new Message',
  MessageBody: 'Open Notification Centre to read your notifications',
  NotificationTitle: 'You have a new Notification',
  NotificationBody: 'Here is the Notification body.',
};

describe('POST {{pso}}/send-to-group - Send a group message', () => {
  describe(`Unhappy paths`, () => {
    test('UND_ERR_CONNECT_TIMEOUT when - attempting to use insecure protocol (http instead of https)', async ({
      psoAPIUsingInsecureProtocol: api,
    }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [mockGroupMessage],
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: 'fetch failed',
          cause: expect.objectContaining({
            code: 'UND_ERR_CONNECT_TIMEOUT',
          }),
        })
      );
    });

    test('status 403 when using invalid api key', async ({ psoAPIWithoutAPIKey: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [mockGroupMessage],
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 403`);
    });

    test('status 400 when when - missing body', async ({ psoAPI: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
          body: {},
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });
  });
});
