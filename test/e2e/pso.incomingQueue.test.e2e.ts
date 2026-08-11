import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { checkStatus, test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

describe('Queue incoming', () => {
  let notificationID: string;
  let messageRequest: IMessage;

  beforeEach(() => {
    notificationID = uuid();
    messageRequest = {
      NotificationID: notificationID,
      CampaignID: 'testCampaignID',
      DepartmentID: 'testDepartmentID',
      OrganisationID: 'end2endTest',
      UserID: 'testExternalUserID',
      NotificationTitle: 'End 2 End Test',
      NotificationBody: 'This is an end 2 end test!',
      MessageTitle: 'End 2 End Test Message Title',
      MessageBody: 'End 2 End Test Message Body',
    };
  });

  describe(`Unhappy paths`, () => {
    test('status VALIDATION_FAILED when - the message has no userID', async ({ psoQueueClient, psoAPI }) => {
      // Arrange
      const messagesWithNoUserID = {
        NotificationID: notificationID,
        CampaignID: 'testCampaignID',
        DepartmentID: 'testDepartmentID',
        NotificationTitle: 'End 2 End Test',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      };

      // Act
      await psoQueueClient(messagesWithNoUserID);

      // Assert
      const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(status).toEqual(
        expect.arrayContaining(
          [NotificationStateEnum.VALIDATING, NotificationStateEnum.VALIDATION_FAILED].map((Status) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            expect.objectContaining({
              Status,
              NotificationID: notificationID,
            })
          )
        )
      );
    });

    test('status VALIDATION_FAILED - the message has no notificationTitle.', async ({ psoQueueClient, psoAPI }) => {
      // Arrange
      const messagesWithNoNotificationTitle = {
        NotificationID: notificationID,
        CampaignID: 'testCampaignID',
        DepartmentID: 'testDepartmentID',
        UserID: 'testExternalUserID',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      };

      // Act
      await psoQueueClient(messagesWithNoNotificationTitle);

      // Assert
      const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(status).toEqual(
        expect.arrayContaining(
          [NotificationStateEnum.VALIDATING, NotificationStateEnum.VALIDATION_FAILED].map((Status) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            expect.objectContaining({
              Status,
              NotificationID: notificationID,
            })
          )
        )
      );
    });

    test('status VALIDATION_FAILED when - the message has no notificationBody', async ({ psoQueueClient, psoAPI }) => {
      // Arrange
      const messagesWithNoNotificationBody = {
        NotificationID: notificationID,
        CampaignID: 'testCampaignID',
        DepartmentID: 'testDepartmentID',
        UserID: 'testExternalUserID',
        NotificationTitle: 'End 2 End Test',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      };

      // Act
      await psoQueueClient(messagesWithNoNotificationBody);

      // Assert
      const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(status).toEqual(
        expect.arrayContaining(
          [NotificationStateEnum.VALIDATING, NotificationStateEnum.VALIDATION_FAILED].map((Status) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            expect.objectContaining({
              Status,
              NotificationID: notificationID,
            })
          )
        )
      );
    });

    test('status VALIDATION_FAILED when - the message has invalid url in markdown', async ({
      psoQueueClient,
      psoAPI,
    }) => {
      // Arrange
      const messagesWithInvalidMarkdown = {
        ...messageRequest,
        MessageBody: '# Heading\n\nThis is a [link](https://example.com) with an unapproved hostname.',
      };

      // Act
      await psoQueueClient(messagesWithInvalidMarkdown);

      // Assert
      const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(status).toEqual(
        expect.arrayContaining(
          [NotificationStateEnum.VALIDATING, NotificationStateEnum.VALIDATION_FAILED].map((Status) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            expect.objectContaining({
              Status,
              NotificationID: notificationID,
            })
          )
        )
      );
    });

    test('status VALIDATION_FAILED when - the message has invalid markdown', async ({ psoQueueClient, psoAPI }) => {
      // Arrange
      const messagesWithInvalidMarkdown = {
        ...messageRequest,
        MessageBody: 'This is <u>underlined html</u> text which is invalid..',
      };

      // Act
      await psoQueueClient(messagesWithInvalidMarkdown);

      // Assert
      const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(status).toEqual(
        expect.arrayContaining(
          [NotificationStateEnum.VALIDATING, NotificationStateEnum.VALIDATION_FAILED].map((Status) =>
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

  describe(`Happy paths`, () => {
    test('status VALIDATED, PROCESSING, and DISPATCHED when - called with a valid notification', async ({
      psoQueueClient,
      psoAPI,
    }) => {
      // Act
      await psoQueueClient(messageRequest);

      // Assert
      const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(status).toEqual(
        expect.arrayContaining(
          [
            NotificationStateEnum.VALIDATING,
            NotificationStateEnum.VALIDATED,
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

    test('status VALIDATED, PROCESSING, and DISPATCHED when - message contains valid markdown', async ({
      psoQueueClient,
      psoAPI,
    }) => {
      // Arrange
      const messageRequestWithValidMarkdown: IMessage = {
        ...messageRequest,
        MessageBody: 'End 2 End Test Message Body',
      };

      // Act
      await psoQueueClient(messageRequestWithValidMarkdown);

      // Assert
      const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
        timeout: 30000,
        interval: 2000,
      });
      expect(status).toEqual(
        expect.arrayContaining(
          [
            NotificationStateEnum.VALIDATING,
            NotificationStateEnum.VALIDATED,
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

  test('status VALIDATED, PROCESSING, and DISPATCHED when - the message has no departmentID', async ({
    psoQueueClient,
    psoAPI,
  }) => {
    // Arrange
    const messagesRequestWithNoDepartmentID: IMessage = {
      ...messageRequest,
      MessageBody: 'End 2 End Test Message Body',
    };
    // Act
    await psoQueueClient(messagesRequestWithNoDepartmentID);

    // Assert
    const status = await vi.waitFor(() => checkStatus(psoAPI, notificationID), {
      timeout: 30000,
      interval: 2000,
    });
    expect(status).toEqual(
      expect.arrayContaining(
        [
          NotificationStateEnum.VALIDATING,
          NotificationStateEnum.VALIDATED,
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
