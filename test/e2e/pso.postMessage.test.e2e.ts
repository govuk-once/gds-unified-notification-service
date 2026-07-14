import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { BadRequestAxiosError } from '@test/e2e/utils/FetchErrors';
import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const url = () => `/status`;
const messageRequest = (notificationID: string, userID: string) => (
  {
    NotificationID: notificationID,
    CampaignID: 'testCampaignID',
    DepartmentID: 'testDepartmentID',
    UserID: userID,
    NotificationTitle: 'End 2 End Test',
    NotificationBody: 'This is an end 2 end test!',
    MessageTitle: 'End 2 End Test Message Title',
    MessageBody: 'End 2 End Test Message Body',
  })

describe('Post /send', () => {
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
  });

  describe(`Happy paths`, () => {
    test('status 202 when - called with a valid array of notifications', async ({ psoAPI, mockNotificationID, validPushID }) => {
      // Act
      const result = await psoAPI.post({ path: '/send', body: [ messageRequest(mockNotificationID.valid, validPushID) ]});

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([
        {
          NotificationID: mockNotificationID.valid,
        },
      ]);
    });

    test('status 202 when - called with a valid notification', async ({ psoAPI, mockNotificationID, validPushID }) => {
      // Act
      const result = await psoAPI.post({ path: '/send', body: [messageRequest(mockNotificationID.valid, validPushID) ]});

      // Assert
      expect(result.status).toBe(202);
      const status = await vi.waitFor(() => checkStatus(psoAPI, mockNotificationID.valid), {
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
              NotificationID: mockNotificationID.valid,
            })
          )
        )
      );
    });

    test('status 202 when - message contains valid markdown', async ({ psoAPI, mockNotificationID, validPushID }) => {
      // Arrange
      const messageWithMarkdown = [{ ...messageRequest(mockNotificationID.valid, validPushID), MessageBody: '### End 2 End Test Message Body'}];

      // Act
      const result = await psoAPI.post({ path: '/send', body: messageWithMarkdown });

      // Assert
      expect(result.status).toBe(202);
      expect(result.body).toEqual([
        {
          NotificationID: mockNotificationID.valid,
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

  test('status 202 when - the message has no departmentID', async ({ psoAPI, mockNotificationID, validPushID }) => {
    // Arrange
    const messagesWithNoDepartmentID = [{ ...messageRequest(mockNotificationID.valid, validPushID), DepartmentID: undefined }];

    // Act
    const result = await psoAPI.post({ path: '/send', body: messagesWithNoDepartmentID });

    // Assert
    expect(result.status).toBe(202);
    expect(result.body).toEqual([{ NotificationID: mockNotificationID.valid }]);
  });

  test('status 400 when - the message has no userID', async ({ psoAPI, mockNotificationID, validPushID }) => {
    // Arrange
    const messagesWithNoUserID = [{ ...messageRequest(mockNotificationID.valid, validPushID), UserID: undefined}]

    // Act
    const result = psoAPI.post({ path: '/send', body: messagesWithNoUserID });

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.UserID.'])
    );
  });

  test('status 400 when - the message has no notificationTitle.', async ({ psoAPI, mockNotificationID, validPushID }) => {
    // Arrange
    const messagesWithNoNotificationTitle = [{ ...messageRequest(mockNotificationID.valid, validPushID), NotificationTitle: undefined}];

    // Act
    const result = psoAPI.post({ path: '/send', body: messagesWithNoNotificationTitle });

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.NotificationTitle.'])
    );
  });

  test('status 400 when - the message has no notificationBody', async ({ psoAPI, mockNotificationID, validPushID }) => {
    // Arrange
    const messagesWithNoNotificationBody = [{ ...messageRequest(mockNotificationID.valid, validPushID), NotificationBody: undefined}];


    // Act
    const result = psoAPI.post({ path: '/send', body: messagesWithNoNotificationBody });

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.NotificationBody.'])
    );
  });

  test('status 400 when - the message has invalid url in markdown', async ({ psoAPI, mockNotificationID, validPushID }) => {
    // Arrange
    const messagesWithInvalidMarkdown = [{ ...messageRequest(mockNotificationID.valid, validPushID), MessageBody: '# Heading\n\nThis is a [link](https://example.com) with an unapproved hostname.'}];

    // Act
    const result = psoAPI.post({ path: '/send', body: messagesWithInvalidMarkdown });

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['https://example.com is using example.com hostname which is not on the allow list'])
    );
  });

  test('status 400 when - the message has invalid markdown', async ({ psoAPI, mockNotificationID, validPushID }) => {
    // Arrange
    const messagesWithInvalidMarkdown = [{ ...messageRequest(mockNotificationID.valid, validPushID), MessageBody: '    const x = 10;\n    const y = 20;'}];

    // Act
    const result = psoAPI.post({ path: '/send', body: messagesWithInvalidMarkdown });

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Message body contains markdown elements which are not valid: code_block'])
    );
  });
});
