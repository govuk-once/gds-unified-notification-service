import { DeleteItemCommandInput, DynamoDB } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { test } from '@test/e2e/setup.e2e.vitest';
import { AxiosError } from 'axios';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

describe('Post /send', () => {
  // Creates dynamoClient for testing
  const dynamoClient = new DynamoDB({
    region: 'eu-west-2',
  });
  const messageTableName = `${process.env.AWS_ENVIRONMENT_PREFIX}-messages`;
  const messageTableKey = 'NotificationID';

  const mockNotificationID = uuid();
  const mockMessages = [
    {
      NotificationID: mockNotificationID,
      DepartmentID: 'testDepartmentID',
      UserID: 'testExternalUserID',
      NotificationTitle: 'End 2 End Test',
      NotificationBody: 'This is an end 2 end test!',
      MessageTitle: 'End 2 End Test Message Title',
      MessageBody: 'End 2 End Test Message Body',
    },
  ];

  test('returns 202 and a list of notificationIDs when calling the post message endpoint, when the request body is valid', async ({
    psoAPI,
  }) => {
    // Arrange
    // Does the notification need to be deleted after test is complete?
    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: messageTableName,
        Key: marshall({
          [messageTableKey]: mockNotificationID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    // Act
    const result = await psoAPI.post('/send', mockMessages);

    // Assert
    expect(result.status).toBe(202);
    expect(result.data).toEqual([
      {
        NotificationID: mockNotificationID,
      },
    ]);
  });

  test('if notification is successfully validated, processed, dispatched and a record is made in DynamoDB.', async ({
    psoAPI,
  }) => {
    // Arrange
    // Does the notification need to be deleted after test is complete?
    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: messageTableName,
        Key: marshall({
          [messageTableKey]: mockNotificationID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    // Act
    const result = await psoAPI.post('/send', mockMessages);

    // Assert
    // Test that the request succeeded before testing DynamoDB
    expect(result.status).toBe(202);

    // Will pull the message record from dynamo every 2s until a notification state is returned or 30s has been reached.
    const record = await vi.waitFor(
      async () => {
        const params = {
          TableName: messageTableName,
          Key: marshall({
            [messageTableKey]: mockNotificationID,
          }),
        };

        const { Item } = await dynamoClient.getItem(params);
        expect(Item).toBeDefined();
        const record = unmarshall(Item ?? {}) as IMessageRecord;

        expect(record).toEqual(
          expect.objectContaining({
            NotificationID: mockNotificationID,
            Events: expect.toBeOneOf([
              expect.arrayContaining([expect.objectContaining({ Event: NotificationStateEnum.DISPATCHED })]),
              expect.arrayContaining([expect.objectContaining({ Event: NotificationStateEnum.VALIDATION_FAILED })]),
              expect.arrayContaining([expect.objectContaining({ Event: NotificationStateEnum.PROCESSING_FAILED })]),
              expect.arrayContaining([expect.objectContaining({ Event: NotificationStateEnum.DISPATCHING_FAILED })]),
            ]),
          })
        );
        return record;
      },
      {
        timeout: 30000,
        interval: 2000,
      }
    );

    console.log(record);

    // Will test the properties of the message record.
    expect(record).toEqual(
      expect.objectContaining({
        NotificationID: mockNotificationID,
        DepartmentID: mockMessages[0].DepartmentID,
        UserID: mockMessages[0].UserID,
        ExternalUserID: expect.stringContaining(''),
        APIGWExtendedID: expect.stringContaining(''),
        NotificationTitle: mockMessages[0].NotificationTitle,
        NotificationBody: mockMessages[0].NotificationBody,
        MessageTitle: mockMessages[0].MessageTitle,
        MessageBody: mockMessages[0].MessageBody,
      })
    );
    expect(new Date(record.ReceivedDateTime ?? '')).toBeDefined();
    expect(record.Events).toEqual(
      expect.arrayContaining([expect.objectContaining({ Event: NotificationStateEnum.VALIDATED_API_CALL })])
    );
    expect(new Date(record.ValidatedDateTime ?? '')).toBeDefined();
    expect(record.Events).toEqual(
      expect.arrayContaining([expect.objectContaining({ Event: NotificationStateEnum.PROCESSED })])
    );
    expect(new Date(record.ProcessedDateTime ?? '')).toBeDefined();
    // Need a way to void test notification while adapter is not VOID.
    //expect(record.Events).toEqual(expect.arrayContaining([expect.objectContaining({Event: NotificationStateEnum.DISPATCHED})]));
    // expect(new Date(record.DispatchedDateTime ?? '')).toBeDefined();
  });

  test('it returns 400 when the request has no body.', async ({ psoAPI }) => {
    // Arrange
    // Does the notification need to be deleted after test is complete?
    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: messageTableName,
        Key: marshall({
          [messageTableKey]: mockNotificationID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    try {
      // Act
      await psoAPI.post('/send');
      throw new Error('Request should have failed with 400 but succeeded instead.');
    } catch (error) {
      // Assert
      expect(error).instanceOf(AxiosError);
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(400);
    }
  });

  test('it returns 400 when the message has no departmentID.', async ({ psoAPI }) => {
    // Arrange
    const mockMessagesWithNoDepartmentID = [
      {
        NotificationID: mockNotificationID,
        UserID: 'testExternalUserID',
        NotificationTitle: 'End 2 End Test',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Does the notification need to be deleted after test is complete?
    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: messageTableName,
        Key: marshall({
          [messageTableKey]: mockNotificationID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    try {
      // Act
      await psoAPI.post('/send', mockMessagesWithNoDepartmentID);
      throw new Error('Request should have failed with 400 but succeeded instead.');
    } catch (error) {
      // Assert
      expect(error).instanceOf(AxiosError);
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(400);
      expect(axiosError.response?.data).toBe(
        'Bad Request: \n\n✖ Invalid input: expected string, received undefined\n  → at [0].DepartmentID'
      );
    }
  });

  test('it returns 400 when the message has no userID.', async ({ psoAPI }) => {
    // Arrange
    const mockMessagesWithNoUserID = [
      {
        NotificationID: mockNotificationID,
        DepartmentID: 'testDepartmentID',
        NotificationTitle: 'End 2 End Test',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Does the notification need to be deleted after test is complete?
    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: messageTableName,
        Key: marshall({
          [messageTableKey]: mockNotificationID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    try {
      // Act
      await psoAPI.post('/send', mockMessagesWithNoUserID);
      throw new Error('Request should have failed with 400 but succeeded instead.');
    } catch (error) {
      // Assert
      expect(error).instanceOf(AxiosError);
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(400);
      expect(axiosError.response?.data).toBe(
        'Bad Request: \n\n✖ Invalid input: expected string, received undefined\n  → at [0].UserID'
      );
    }
  });

  test('it returns 400 when the message has no notificationTitle.', async ({ psoAPI }) => {
    // Arrange
    const mockMessagesWithNoNotificationTitle = [
      {
        NotificationID: mockNotificationID,
        DepartmentID: 'testDepartmentID',
        UserID: 'testExternalUserID',
        NotificationBody: 'This is an end 2 end test!',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Does the notification need to be deleted after test is complete?
    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: messageTableName,
        Key: marshall({
          [messageTableKey]: mockNotificationID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    try {
      // Act
      await psoAPI.post('/send', mockMessagesWithNoNotificationTitle);
      throw new Error('Request should have failed with 400 but succeeded instead.');
    } catch (error) {
      // Assert
      expect(error).instanceOf(AxiosError);
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(400);
      expect(axiosError.response?.data).toBe(
        'Bad Request: \n\n✖ Invalid input: expected string, received undefined\n  → at [0].NotificationTitle'
      );
    }
  });

  test('it returns 400 when the message has no notificationBody.', async ({ psoAPI }) => {
    // Arrange
    const mockMessagesWithNoNotificationBody = [
      {
        NotificationID: mockNotificationID,
        DepartmentID: 'testDepartmentID',
        UserID: 'testExternalUserID',
        NotificationTitle: 'End 2 End Test',
        MessageTitle: 'End 2 End Test Message Title',
        MessageBody: 'End 2 End Test Message Body',
      },
    ];

    // Does the notification need to be deleted after test is complete?
    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: messageTableName,
        Key: marshall({
          [messageTableKey]: mockNotificationID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    try {
      // Act
      await psoAPI.post('/send', mockMessagesWithNoNotificationBody);
      throw new Error('Request should have failed with 400 but succeeded instead.');
    } catch (error) {
      // Assert
      expect(error).instanceOf(AxiosError);
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(400);
      expect(axiosError.response?.data).toBe(
        'Bad Request: \n\n✖ Invalid input: expected string, received undefined\n  → at [0].NotificationBody'
      );
    }
  });
});
