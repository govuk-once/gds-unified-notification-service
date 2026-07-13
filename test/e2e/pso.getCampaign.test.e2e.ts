import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

const url = (campaignID: string) => `/status/campaign/${campaignID}`;

describe('[GET] {{PSO}}/status/campaign/{campaignID}', () => {
  const notificationID = uuid();
  const campaignID = 'testCampaignID';
  const departmentID = 'UNS';

  describe(`Unahppy paths`, () => {
    test('UND_ERR_CONNECT_TIMEOUT when - attempting to use insecure protocol (http instead of https)', async ({
      psoAPIUsingInsecureProtocol: api,
    }) => {
      // Arrange
      const path = url(campaignID);

      // Act & Assert
      await expect(
        api.get({
          path,
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

    test('ECONNRESET when - missing MTLS certificate', async ({ psoAPIWithoutMTLSCert: api }) => {
      // Arrange
      const path = url(campaignID);

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: 'fetch failed',
          cause: expect.objectContaining({
            code: 'ECONNRESET',
          }),
        })
      );
    });

    test('status 403 when - using invalid api key', async ({ psoAPIWithoutAPIKey: api }) => {
      // Arrange
      const path = url(campaignID);

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 403`);
    });
  });
  describe(`Happy paths`, () => {
    const mockMessageWithCampaign = [
      {
        CampaignID: campaignID,
        DepartmentID: departmentID,
        NotificationID: notificationID,
        UserID: 'UserID',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new Notification',
        NotificationBody: 'Here is the Notification body.',
      },
    ];

    test('status 200 when - a campaign status endpoint is called with existing campaign', async ({ psoAPI }) => {
      // Arrange
      await psoAPI.post({ path: '/send', body: mockMessageWithCampaign });
      await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });

      // Act
      const result = await psoAPI.get({ path: `/status/campaign/${campaignID}?departmentID=${departmentID}` });

      // Assert
      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        CampaignID: campaignID,
        DepartmentID: departmentID,
        ProcessingSummary: {
          RECEIVED: expect.any(Number),
          PROCESSED: expect.any(Number),
          DISPATCHED: expect.any(Number),
        },
        UsageSummary: {
          READ: expect.any(Number),
          MARKED_AS_UNREAD: expect.any(Number),
          HIDDEN: expect.any(Number),
        },
      });
    });
  });
});
