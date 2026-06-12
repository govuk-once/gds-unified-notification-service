import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { BadRequestAxiosError } from '@test/e2e/utils/AxiosErrors';
import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

describe('Post /send', () => {
  let notificationID: string;
  let messageRequest: IMessage[];

  beforeEach(() => {
    notificationID = uuid();
    messageRequest = [
      {
        NotificationID: notificationID,
        OrganisationID: 'ORG01',
        CampaignID: 'testCampaignID',
        DepartmentID: 'testDepartmentID',
        UserID: 'testExternalUserID',
        NotificationTitle: 'End 2 End Test',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];
  });

  test('returns 202 and a list of notificationIDs when calling the post message endpoint, when the request body is valid', async ({
    psoAPI,
  }) => {
    // Act
    const result = await psoAPI.post('/send', messageRequest);

    // Assert
    expect(result.status).toBe(202);
    expect(result.data).toEqual([
      {
        NotificationID: notificationID,
      },
    ]);
  });

  test('if notification is successfully validated, processed, dispatched.', async ({ psoAPI }) => {
    // Act
    const result = await psoAPI.post('/send', messageRequest);

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

  test('returns 202 when message is valid markdown', async ({ psoAPI }) => {
    // Arrange
    const messageWithoutFormat = [
      {
        NotificationID: notificationID,
        OrganisationID: 'ORG01',
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
    const result = await psoAPI.post('/send', messageWithoutFormat);

    // Assert
    expect(result.status).toBe(202);
    expect(result.data).toEqual([
      {
        NotificationID: notificationID,
      },
    ]);
  });

  test('it returns 400 when the request has no body.', async ({ psoAPI }) => {
    // Act
    const result = psoAPI.post('/send');

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected array, received null → at .'])
    );
  });

  test('it returns 400 when the message has no departmentID.', async ({ psoAPI }) => {
    // Arrange
    const messagesWithNoDepartmentID = [
      {
        NotificationID: notificationID,
        OrganisationID: 'ORG01',
        CampaignID: 'testCampaignID',
        UserID: 'testExternalUserID',
        NotificationTitle: 'End 2 End Test',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Act
    const result = psoAPI.post('/send', messagesWithNoDepartmentID);

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.DepartmentID.'])
    );
  });

  test('it returns 400 when the message has no userID.', async ({ psoAPI }) => {
    // Arrange
    const messagesWithNoUserID = [
      {
        NotificationID: notificationID,
        OrganisationID: 'ORG01',
        CampaignID: 'testCampaignID',
        DepartmentID: 'testDepartmentID',
        NotificationTitle: 'End 2 End Test',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Act
    const result = psoAPI.post('/send', messagesWithNoUserID);

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.UserID.'])
    );
  });

  test('it returns 400 when the message has no notificationTitle.', async ({ psoAPI }) => {
    // Arrange
    const messagesWithNoNotificationTitle = [
      {
        NotificationID: notificationID,
        OrganisationID: 'ORG01',
        CampaignID: 'testCampaignID',
        DepartmentID: 'testDepartmentID',
        UserID: 'testExternalUserID',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Act
    const result = psoAPI.post('/send', messagesWithNoNotificationTitle);

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.NotificationTitle.'])
    );
  });

  test('it returns 400 when the message has no notificationBody.', async ({ psoAPI }) => {
    // Arrange
    const messagesWithNoNotificationBody = [
      {
        NotificationID: notificationID,
        OrganisationID: 'ORG01',
        CampaignID: 'testCampaignID',
        DepartmentID: 'testDepartmentID',
        UserID: 'testExternalUserID',
        NotificationTitle: 'End 2 End Test',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Act
    const result = psoAPI.post('/send', messagesWithNoNotificationBody);

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Invalid input: expected string, received undefined → at 0.NotificationBody.'])
    );
  });

  test('it returns 400 when the message has invalid url in markdown.', async ({ psoAPI }) => {
    // Arrange
    const messagesWithInvalidMarkdown: IMessage[] = [
      {
        NotificationID: notificationID,
        OrganisationID: 'ORG01',
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
    const result = psoAPI.post('/send', messagesWithInvalidMarkdown);

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['https://example.com is using example.com hostname which is not on the allow list'])
    );
  });

  test('it returns 400 when the message has invalid markdown.', async ({ psoAPI }) => {
    // Arrange
    const messagesWithInvalidMarkdown: IMessage[] = [
      {
        NotificationID: notificationID,
        OrganisationID: 'ORG01',
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
    const result = psoAPI.post('/send', messagesWithInvalidMarkdown);

    // Assert
    await expect(result).rejects.toMatchObject(
      BadRequestAxiosError(['Message body contains markdown elements which are not valid: code_block'])
    );
  });
});
