import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { NotFoundAxiosError } from '@test/e2e/utils/AxiosErrors';
import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';

describe('Get /status/{notificationID}', () => {
  let notificationID: string;
  let messageRequest: Omit<IMessage, 'OrganisationID'>[];

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
      expect.arrayContaining(
        [
          NotificationStateEnum.VALIDATED_API_CALL,
          NotificationStateEnum.PROCESSING,
          // Need a way to void test notification while adapter is not VOID.
          // NotificationStateEnum.PROCESSED,
          // NotificationStateEnum.DISPATCHING,
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
  });

  test('returns 404 and when notificationID is invalid.', async ({ psoAPI }) => {
    // Arrange
    const mockInvalidNotificationID = 'invalid-notification-id';

    // Act
    const result = psoAPI.get(`/status/${mockInvalidNotificationID}`);

    // Assert
    await expect(result).rejects.toMatchObject(NotFoundAxiosError());
  });
});
