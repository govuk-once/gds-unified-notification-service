import { DynamoDB, PutItemCommandInput, DeleteItemCommandInput } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { test } from '@test/e2e/setup.e2e.vitest';
import { AxiosError } from 'axios';
import { v4 as uuid } from 'uuid';

describe('Get /status/{notificationID}', () => {
  // Creates dynamoClient for testing
  const dynamoClient = new DynamoDB({
    region: 'eu-west-2',
  });
  const messagesTableName = `${process.env.AWS_ENVIRONMENT_PREFIX}-messages`;
  const messageTableKey = 'NotificationID';

  const mockNotificationID = uuid();
  const mockEventID = uuid();
  const mockDepartmentID = 'testDepartmentID';

  const mockMessageRecord: IMessageRecord = {
    NotificationID: mockNotificationID,
    DepartmentID: mockDepartmentID,
    UserID: 'testExternalUserID',
    NotificationTitle: 'End 2 End Test',
    NotificationBody: 'This is an end 2 end test!',
    MessageTitle: 'End 2 End Test Message Title',
    MessageBody: 'End 2 End Test Message Body',
    Events: [
      {
        Event: NotificationStateEnum.VALIDATING,
        EventDateTime: new Date().toISOString(),
        EventID: mockEventID,
        NotificationID: mockNotificationID,
        DepartmentID: mockDepartmentID,
        EventReason: 'Test event reason',
      },
      {
        Event: NotificationStateEnum.VALIDATED,
        EventDateTime: new Date().toISOString(),
        EventID: mockEventID,
        NotificationID: mockNotificationID,
        DepartmentID: mockDepartmentID,
        EventReason: 'Test event reason',
      },
    ],
  };

  test('returns 200 and a list of notifications statues.', async ({ psoAPI }) => {
    // Arrange
    const createMockRecordParams: PutItemCommandInput = {
      TableName: messagesTableName,
      Item: marshall(mockMessageRecord, { removeUndefinedValues: true }),
    };
    await dynamoClient.putItem(createMockRecordParams);

    // Does the notification need to be deleted after test is complete?
    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: messagesTableName,
        Key: marshall({
          [messageTableKey]: mockNotificationID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    // Act
    const result = await psoAPI.get(`/status/${mockNotificationID}`);

    // Assert
    expect(result.status).toBe(200);
    expect(result.data).toEqual([
      {
        Status: mockMessageRecord.Events[0].Event,
        EventTimestamp: mockMessageRecord.Events[0].EventDateTime,
        NotificationID: mockMessageRecord.NotificationID,
      },
      {
        Status: mockMessageRecord.Events[1].Event,
        EventTimestamp: mockMessageRecord.Events[1].EventDateTime,
        NotificationID: mockMessageRecord.NotificationID,
      },
    ]);
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
