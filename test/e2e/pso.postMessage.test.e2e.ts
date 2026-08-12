import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { BadRequestAxiosError } from '@test/e2e/utils/FetchErrors';
import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

const url = () => `/status`;

describe('Post /send', () => {
  let notificationID: string;
  let messageRequest: Omit<IMessage, 'OrganisationID'>[];

  beforeEach(() => {
    notificationID = uuid();
    messageRequest = [
      {
        NotificationID: notificationID,
        CampaignID: 'MESSAGE_API_E2E_TEST',
        DepartmentID: 'testDepartmentID',
        UserID: 'testExternalUserID',
        NotificationTitle: 'End 2 End Test - POST Message',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];
  });

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
      const path = url();

      // Act & Assert
      await expect(
        api.post({
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
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 403`);
    });

    test('status 400 when - the message has no userID', async ({ psoAPI }) => {
      // Arrange
      const messagesWithNoUserID = [
        {
          NotificationID: notificationID,
          CampaignID: 'testCampaignID',
          DepartmentID: 'testDepartmentID',
          NotificationTitle: 'End 2 End Test',
          NotificationBody: 'This is an end 2 end test!',
          MessageTitle: 'End 2 End Test Message Title',
          MessageBody: 'End 2 End Test Message Body',
        },
      ];

      // Act
      const result = psoAPI.post({ path: '/send', body: messagesWithNoUserID });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.UserID.'])
      );
    });

    test('status 400 when - the message has no notificationTitle.', async ({ psoAPI }) => {
      // Arrange
      const messagesWithNoNotificationTitle = [
        {
          NotificationID: notificationID,
          CampaignID: 'testCampaignID',
          DepartmentID: 'testDepartmentID',
          UserID: 'testExternalUserID',
          NotificationBody: 'This is an end 2 end test!',
          MessageTitle: 'End 2 End Test Message Title',
          MessageBody: 'End 2 End Test Message Body',
        },
      ];

      // Act
      const result = psoAPI.post({ path: '/send', body: messagesWithNoNotificationTitle });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.NotificationTitle.'])
      );
    });

    test('status 400 when - the message has no notificationBody', async ({ psoAPI }) => {
      // Arrange
      const messagesWithNoNotificationBody = [
        {
          NotificationID: notificationID,
          CampaignID: 'testCampaignID',
          DepartmentID: 'testDepartmentID',
          UserID: 'testExternalUserID',
          NotificationTitle: 'End 2 End Test',
          MessageTitle: 'End 2 End Test Message Title',
          MessageBody: 'End 2 End Test Message Body',
        },
      ];

      // Act
      const result = psoAPI.post({ path: '/send', body: messagesWithNoNotificationBody });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.NotificationBody.'])
      );
    });

    test('status 400 when - the message has invalid url in markdown', async ({ psoAPI }) => {
      // Arrange
      const messagesWithInvalidMarkdown: Omit<IMessage, 'OrganisationID'>[] = [
        {
          NotificationID: notificationID,
          CampaignID: 'testCampaignID',
          DepartmentID: 'testDepartmentID',
          UserID: 'testExternalUserID',
          NotificationTitle: 'End 2 End Test',
          NotificationBody: 'This is an end 2 end test!',
          MessageTitle: 'End 2 End Test Message Title',
          MessageBody: '# Heading\n\nThis is a [link](https://example.com) with an unapproved hostname.',
        },
      ];

      // Act
      const result = psoAPI.post({ path: '/send', body: messagesWithInvalidMarkdown });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['https://example.com is using example.com hostname which is not on the allow list'])
      );
    });

    test('status 400 when - the message has invalid markdown', async ({ psoAPI }) => {
      // Arrange
      const messagesWithInvalidMarkdown: Omit<IMessage, 'OrganisationID'>[] = [
        {
          NotificationID: notificationID,
          CampaignID: 'testCampaignID',
          DepartmentID: 'testDepartmentID',
          UserID: 'testExternalUserID',
          NotificationTitle: 'End 2 End Test',
          NotificationBody: 'This is an end 2 end test!',
          MessageTitle: 'End 2 End Test Message Title',
          MessageBody: '    const x = 10;\n    const y = 20;',
        },
      ];

      // Act
      const result = psoAPI.post({ path: '/send', body: messagesWithInvalidMarkdown });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['Message body contains markdown elements which are not valid: code_block'])
      );
    });
  });

  describe(`Happy paths`, () => {
    test('status 202 when - called with a valid array of notifications', async ({ psoAPI }) => {
      // Act
      const result = await psoAPI.post({ path: '/send', body: messageRequest });

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([
        {
          NotificationID: notificationID,
        },
      ]);
    });

    test('status 202 when - called with a valid notification', async ({ psoAPI }) => {
      // Act
      const result = await psoAPI.post({ path: '/send', body: messageRequest });

      // Assert
      expect(result.status).toBe(202);
      const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(status).toEqual(
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

    test('status 202 when - message contains valid markdown', async ({ psoAPI }) => {
      // Arrange
      const body = [
        {
          NotificationID: notificationID,
          CampaignID: 'testCampaignID',
          DepartmentID: 'testDepartmentID',
          UserID: 'testExternalUserID',
          NotificationTitle: 'End 2 End Test',
          NotificationBody: 'This is an end 2 end test!',
          MessageTitle: 'End 2 End Test Message Title',
          MessageBody: 'End 2 End Test Message Body',
        },
      ];

      // Act
      const result = await psoAPI.post({ path: '/send', body });

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([
        {
          NotificationID: notificationID,
        },
      ]);
    });
  });

  test('status 400 when - the request has no body', async ({ psoAPI }) => {
    // Act
    const result = psoAPI.post({ path: '/send' });

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected array, received null → at .'])
    );
  });

  test('status 202 when - the message has no departmentID', async ({ psoAPI }) => {
    // Arrange
    const messagesWithNoDepartmentID = [
      {
        NotificationID: notificationID,
        CampaignID: 'testCampaignID',
        UserID: 'testExternalUserID',
        NotificationTitle: 'End 2 End Test',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Act
    const result = await psoAPI.post({ path: '/send', body: messagesWithNoDepartmentID });

    // Assert
    expect(result.status).toBe(202);
    expect(result.body).toEqual([{ NotificationID: notificationID }]);
  });
});
