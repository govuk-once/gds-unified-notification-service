import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { BadRequestAxiosError } from '@test/e2e/utils/FetchErrors';
import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

const path = `/send`;

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
      const result = psoAPI.post({ path, body: messagesWithNoUserID });

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
      const result = psoAPI.post({ path, body: messagesWithNoNotificationTitle });

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
      const result = psoAPI.post({ path, body: messagesWithNoNotificationBody });

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
      const result = psoAPI.post({ path, body: messagesWithInvalidMarkdown });

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
      const result = psoAPI.post({ path, body: messagesWithInvalidMarkdown });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['Message body contains markdown elements which are not valid: code_block'])
      );
    });

    test('status 400 when - the request has no body', async ({ psoAPI }) => {
      // Act
      const result = psoAPI.post({ path });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['Invalid input: expected array, received null → at .'])
      );
    });

    test('status 400 when - the message has an invalid ExpireInDays (negative)', async ({ psoAPI }) => {
      // Arrange
      const messagesWithInvalidExpiresInDays = [
        {
          ...messageRequest[0],
          ExpiresInDays: -1,
        },
      ];

      // Act
      const result = psoAPI.post({ path, body: messagesWithInvalidExpiresInDays });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['Too small: expected number to be >0 → at 0.ExpiresInDays.'])
      );
    });

    test('status 400 when - the message has an invalid ExpireInDays (float)', async ({ psoAPI }) => {
      // Arrange
      const messagesWithInvalidExpiresInDays = [
        {
          ...messageRequest[0],
          ExpiresInDays: 0.5,
        },
      ];

      // Act
      const result = psoAPI.post({ path, body: messagesWithInvalidExpiresInDays });

      // Assert
      await expect(result).rejects.toMatchObject(
        BadRequestAxiosError(['Invalid input: expected int, received number → at 0.ExpiresInDays.'])
      );
    });

    test('status 400 when - the message has an ExpireInDays less than the organisation minimum', async ({ psoAPI }) => {
      // This required that the organisation config for UNS is set to Min: 2
      // Arrange
      const messagesWithInvalidExpiresInDays = [
        {
          ...messageRequest[0],
          ExpiresInDays: 1,
        },
      ];

      // Act
      const result = psoAPI.post({ path, body: messagesWithInvalidExpiresInDays });

      // Assert
      await expect(result).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });

    test('status 400 when - the message has an ExpireInDays greater than the organisation maximum', async ({
      psoAPI,
    }) => {
      // This required that the organisation config for UNS is set to Min: 30
      // Arrange
      const messagesWithInvalidExpiresInDays = [
        {
          ...messageRequest[0],
          ExpiresInDays: 31,
        },
      ];

      // Act
      const result = psoAPI.post({ path, body: messagesWithInvalidExpiresInDays });

      // Assert
      await expect(result).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });
  });

  describe(`Happy paths`, () => {
    test('status 202 when - called with a valid array of notifications', async ({ psoAPI }) => {
      // Act
      const result = await psoAPI.post({ path, body: messageRequest });

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
      const result = await psoAPI.post({ path, body: messageRequest });

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
          ...messageRequest[0],
          MessageBody:
            'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
        },
      ];

      // Act
      const result = await psoAPI.post({ path, body });

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([
        {
          NotificationID: notificationID,
        },
      ]);
    });

    test('status 202 when - the message has no departmentID', async ({ psoAPI }) => {
      // Arrange
      const messagesWithNoDepartmentID = [
        {
          ...messageRequest[0],
          DepartmentID: undefined,
        },
      ];

      // Act
      const result = await psoAPI.post({ path, body: messagesWithNoDepartmentID });

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([{ NotificationID: notificationID }]);
    });

    test('status 202 when - the message has a valid ExpiresInDays', async ({ psoAPI }) => {
      // Arrange
      const messagesWithExpiresInDays = [
        {
          ...messageRequest[0],
          ExpiresInDays: 25,
        },
      ];

      // Act
      const result = await psoAPI.post({ path, body: messagesWithExpiresInDays });

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([{ NotificationID: notificationID }]);
    });

    test('status 202 when - the message has an ExpiresInDays equal to the organisation minimum', async ({ psoAPI }) => {
      // Arrange
      // This required that the organisation config for UNS is set to Min: 2
      const messagesWithExpiresInDays = [
        {
          ...messageRequest[0],
          ExpiresInDays: 2,
        },
      ];

      // Act
      const result = await psoAPI.post({ path, body: messagesWithExpiresInDays });

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([{ NotificationID: notificationID }]);
    });

    test('status 202 when - the message has an ExpiresInDays equal to the organisation maximum', async ({ psoAPI }) => {
      // Arrange
      // This required that the organisation config for UNS is set to Max: 30
      const messagesWithExpiresInDays = [
        {
          ...messageRequest[0],
          ExpiresInDays: 30,
        },
      ];

      // Act
      const result = await psoAPI.post({ path, body: messagesWithExpiresInDays });

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([{ NotificationID: notificationID }]);
    });
  });
});
