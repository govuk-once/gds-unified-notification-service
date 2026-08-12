import { NotificationStateEnum } from '@common/models';
import { md5ToUuidV4 } from '@common/utils/checksumString';
import { IGroupMessage } from '@project/lambdas';
import { checkStatus, test, testFixtures } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const url = () => `/v1/send-to-group`;
const buildNotificationID = (pushID: string, groupMessage: Omit<IGroupMessage, 'OrganisationID'>) => {
  return md5ToUuidV4({
    PushID: pushID,
    NotificationTitle: groupMessage.NotificationTitle,
    NotificationBody: groupMessage.NotificationBody,
    MessageTitle: groupMessage.MessageTitle,
    MessageBody: groupMessage.MessageBody,
    GroupNotificationID: groupMessage.GroupNotificationID,
  });
};

const mockGroupMessage: Omit<IGroupMessage, 'OrganisationID'> = {
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

const pushIDs = [
  `a53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
  `b53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
  `c53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
  `d53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
  `e53f62d9-a121-4a16-bd98-da89cd0cdfa0`,
];

beforeAll(async () => {
  // Setup a user in some group to be able to send a message to that group
  const flexApi = testFixtures().flexAPI;
  const group = [
    {
      Namespace: 'test',
      Group: 'end2end',
      Subgroup: 'immediate',
      Action: 'JOIN',
    },
  ];

  for (const pushID of pushIDs) {
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

    test('status 400 when when - missing namespace', async ({ psoAPI: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [
            {
              ...mockGroupMessage,
              Namespace: undefined,
            },
          ],
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });

    test('status 400 when when - missing group', async ({ psoAPI: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [
            {
              ...mockGroupMessage,
              Group: undefined,
            },
          ],
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });

    test('status 400 when when - missing NotificationTitle', async ({ psoAPI: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [
            {
              ...mockGroupMessage,
              NotificationTitle: undefined,
            },
          ],
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });

    test('status 400 when when - missing NotificationBody', async ({ psoAPI: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [
            {
              ...mockGroupMessage,
              NotificationBody: undefined,
            },
          ],
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

    test('processed and dispatch status - sending a group message', async ({ psoAPI: api }) => {
      // Arrange
      const path = url();
      const notificationIDs = pushIDs.map((p) => buildNotificationID(p, mockGroupMessage));

      // Act
      const result = await api.post({
        path,
        body: [mockGroupMessage],
      });

      // Assert
      expect(result.status).toBe(202);
      for (const notificationID of notificationIDs) {
        const status = await vi.waitFor(() => checkStatus(api, notificationID), {
          timeout: 30000,
          interval: 2000,
        });
        expect(status).toEqual(
          expect.arrayContaining(
            [
              NotificationStateEnum.PROCESSING,
              NotificationStateEnum.PROCESSED,
              NotificationStateEnum.DISPATCHING,
              // Need a way to void test notification while adapter is not VOID.
              // NotificationStateEnum.DISPATCHED,
            ].map((Status) =>
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return
              expect.objectContaining({
                Status,
                NotificationID: notificationID,
              })
            )
          )
        );
      }
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
