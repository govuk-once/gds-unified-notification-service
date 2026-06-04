import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { NotFoundAxiosError } from '@test/e2e/utils/AxiosErrors';
import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

describe('Get /status/campaign/{campaignID}', () => {
  const notificationID = uuid();
  const campaignID = 'testCampaignID';
  const departmentID = 'UNS';

  const mockMessageWithCampaign: IMessage[] = [
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

  test('returns 200 and a campaign status object when called with a campaignID that exits.', async ({ psoAPI }) => {
    // Arrange
    await psoAPI.post('/send', mockMessageWithCampaign);
    await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
      timeout: 30000,
      interval: 2000,
    });

    // Act
    const result = await psoAPI.get(`/status/campaign/${campaignID}?departmentID=${departmentID}`);

    // Assert
    expect(result.status).toBe(200);
    expect(result.data).toEqual({
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

  test('returns 404 when given campaignID does not exist.', async ({ psoAPI }) => {
    // Arrange
    const invalidCampaignID = 'invalidCampaignID';

    // Act
    const result = psoAPI.get(`/status/campaign/${invalidCampaignID}`);

    // Assert
    await expect(result).rejects.toMatchObject(NotFoundAxiosError);
  });
});
