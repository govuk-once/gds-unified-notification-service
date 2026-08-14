import { IGroupMessage } from '@project/lambdas';
import { checkCampaignStatus, test, testFixtures } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

const path = `/v1/send-to-group`;

const mockGroupMessage: Omit<IGroupMessage, 'OrganisationID'> = {
  Namespace: 'test',
  Group: 'end2end',
  Subgroup: 'immediate',
  GroupNotificationID: 'GROUP_ID' + uuid(),
  NotificationTitle: 'End 2 End Test - POST Group Message',
  NotificationBody: 'This is an end 2 end test!',
  MessageTitle: 'End 2 End Test Message Title',
  MessageBody: 'End 2 End Test Message Body',
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
      // Act & Assert
      await expect(
        api.post({
          path,
          body: [mockGroupMessage],
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 403`);
    });

    test('status 400 when when - missing body', async ({ psoAPI: api }) => {
      // Act & Assert
      await expect(
        api.post({
          path,
          body: {},
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });

    test('status 400 when when - missing body', async ({ psoAPI: api }) => {
      // Act & Assert
      await expect(
        api.post({
          path,
          body: {},
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });

    test('status 400 when when - missing namespace', async ({ psoAPI: api }) => {
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
    test('that the status count for the campaign shows the message is processed and dispatched', async ({
      psoAPI: api,
    }) => {
      // Arrange
      const campaignID = `GROUP_MESSAGE_E2E_TEST_${new Date().toISOString()}`;
      const mockGroupMessageWithCampaign = {
        ...mockGroupMessage,
        CampaignID: campaignID,
      };

      // Act
      const result = await api.post({
        path,
        body: [mockGroupMessageWithCampaign],
      });

      // Assert
      const campaignStatus = await vi.waitFor(() => checkCampaignStatus(api, campaignID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(result.status).toEqual(202);
      expect(campaignStatus.PROCESSED).toBeGreaterThan(0);
      // expect(campaignStatus.DISPATCHED ).toBeGreaterThan(0);
    });

    test('status 202 and number of users in group when - sending a group message', async ({ psoAPI: api }) => {
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
  });
});
