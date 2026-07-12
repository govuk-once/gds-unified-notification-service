import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';

const url = (NotificationID: string) => `/status/${NotificationID}`;

describe('GET /status/{notificationID}', () => {
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

  describe(`Unhappy paths`, () => {
    test('UND_ERR_CONNECT_TIMEOUT when - attempting to use insecure protocol (http instead of https)', async ({
      psoAPIUsingInsecureProtocol: api,
    }) => {
      // Arrange
      const path = url(notificationID);

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
      const path = url(notificationID);

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
      const path = url(notificationID);

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 403`);
    });

    test('status 404 when - notificationID points at an non-existing resource', async ({ psoAPI: api }) => {
      // Arrange
      const path = url('invalid-notification-id');

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 404`);
    });
  });

  describe(`Happy paths`, () => {
    test('status 200 - a list of notifications statuses', async ({ psoAPI }) => {
      // Arrange
      await psoAPI.post({ path: '/send', body: messageRequest });
      await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });

      // Act
      const result = await psoAPI.get({ path: url(notificationID) });

      // Assert
      expect(result.status).toBe(200);
      expect(result.body).toEqual(
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
  });
});
