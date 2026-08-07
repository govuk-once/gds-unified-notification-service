import { test, testFixtures } from '@test/e2e/utils/setup.e2e.vitest';
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

beforeAll(async () => {
  // Setup a user in some group to be able to send a message to that group
  const flexApi = testFixtures().flexAPI;

  const pushIDUsers = [
    `a53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
    `b53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
    `c53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
    `d53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
    `e53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
  ];
  const group = [
    {
      Namespace: 'test',
      Group: 'end2end',
      Subgroup: 'immediate',
      Action: 'JOIN',
    },
  ];

  for (const pushID of pushIDUsers) {
    await flexApi.post({ path: `/v1/groups?pushID=${pushID}`, body: group });
  }
});

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

  describe(`Happy paths`, () => {
    test('status 202 and number of users in group when - sending a group message', async ({ psoAPI: api }) => {
      // Arrange
      const path = url();

      // Act
      const result = await api.post({
        path,
        body: [mockGroupMessage],
      });

      // Assert
      expect(result.status).toEqual(202);
      expect(result.body).toEqual([
        {
          GroupNotificationID: mockGroupMessage.GroupNotificationID,
          UsersInGroup: 5,
        },
      ]);
    });

    test('status 202 and number of users in group when - sending a group message with no users', async ({
      psoAPI: api,
    }) => {
      // Arrange
      const path = url();

      // Act
      const result = await api.post({
        path,
        body: [
          {
            ...mockGroupMessage,
            Group: 'nonexistent-group',
          },
        ],
      });

      // Assert
      expect(result.status).toEqual(202);
      expect(result.body).toEqual([
        {
          GroupNotificationID: mockGroupMessage.GroupNotificationID,
          UsersInGroup: 0,
        },
      ]);
    });
  });
});
