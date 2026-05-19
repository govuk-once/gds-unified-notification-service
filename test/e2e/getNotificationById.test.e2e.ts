import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { checkStatus, test } from '@test/e2e/setup.e2e.vitest';
import { AxiosError } from 'axios';
import { v4 as uuid } from 'uuid';

describe('Get /status/{notificationID}', () => {
  let notificationID: string;
  let messageRequest: IMessage[];

  beforeEach(() => {
    notificationID = uuid();
    messageRequest = [
      {
        NotificationID: notificationID,
        CampaignID: 'TestCampaignID',
        DepartmentID: 'TestDepartmentID',
        UserID: 'TestUserID',
        MessageTitle: 'You have a new Test Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'This message is an end to end test.',
        NotificationBody: 'Here is the Notification body.',
      },
    ];
  });

  test('returns 200 and a list of notifications statuses.', async ({ psoAPI }) => {
    // Arrange
    await psoAPI.post('/send', messageRequest);
    await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
      timeout: 30000,
      interval: 2000,
    });

    // Act
    const result = await psoAPI.get(`/status/${notificationID}`);

    // Assert
    expect(result.status).toBe(200);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Status: NotificationStateEnum.VALIDATED_API_CALL,
          NotificationID: notificationID,
        }),
        expect.objectContaining({
          Status: NotificationStateEnum.PROCESSING,
          NotificationID: notificationID,
        }),
        expect.objectContaining({
          Status: NotificationStateEnum.PROCESSED,
          NotificationID: notificationID,
        }),
        expect.objectContaining({
          Status: NotificationStateEnum.DISPATCHING,
          NotificationID: notificationID,
        }),
        // Need a way to void test notification while adapter is not VOID.

        // expect.objectContaining({
        //   Status: NotificationStateEnum.DISPATCHED,
        //   EventTimestamp: expect.any(DateTimeFormat),
        // }),
      ])
    );
  });

  test('returns 404 and when notificationID is invalid.', async ({ psoAPI }) => {
    // Arrange
    const mockInvalidNotificationID = 'invalid-notification-id';

    try {
      // Act
      const result = await psoAPI.get(`/status/${mockInvalidNotificationID}`);
      throw new Error('Request should have failed with 404, but succeeded with status ' + result.status);
    } catch (error) {
      // Assert
      expect(error).instanceOf(AxiosError);
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(404);
    }
  });
});
