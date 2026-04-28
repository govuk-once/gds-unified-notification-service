import { BatchProcessingError, FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { QueueEvent } from '@common/operations';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Processing } from '@project/lambdas/pso/sqs.processing/handler';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

mockClient(SecretsManagerClient);

describe('Processing QueueHandler', () => {
  let instance: Processing;
  let handler: ReturnType<typeof Processing.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);
  const smMock = mockClient(SecretsManagerClient);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Data presets
  const mockContext: Context = {
    functionName: 'processing',
    awsRequestId: '12345',
  } as unknown as Context;

  const mockMessageBody_1: IMessage = {
    NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
    DepartmentID: 'DVLA01',
    UserID: 'UserID',
    NotificationTitle: 'Test message - 001',
    NotificationBody: "You've got a message in the message centre",
    MessageTitle: '',
    MessageBody: '',
  };

  const mockMessageBody_2: IMessage = {
    NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d2',
    DepartmentID: 'DVLA01',
    UserID: 'UserID_2',
    NotificationTitle: 'Test message - 002',
    NotificationBody: "You've got a message in the message centre - 2",
    MessageTitle: '',
    MessageBody: '',
  };

  const mockEvent: QueueEvent<IMessage> = {
    Records: [
      {
        messageId: 'mockMessageId_1',
        receiptHandle: 'mockReceiptHandle',
        attributes: {
          ApproximateReceiveCount: '2',
          SentTimestamp: '202601021513',
          SenderId: 'mockSenderId',
          ApproximateFirstReceiveTimestamp: '202601021513',
        },
        messageAttributes: {},
        md5OfBody: 'mockMd5OfBody',
        md5OfMessageAttributes: 'mockMd5OfMessageAttributes',
        eventSource: 'aws:sqs',
        eventSourceARN: 'mockEventSourceARN',
        awsRegion: 'eu-west2',
        body: mockMessageBody_1,
      },
    ],
  };

  const mockEvents: QueueEvent<IMessage> = {
    Records: [
      mockEvent.Records[0],
      {
        messageId: 'mockMessageId_2',
        receiptHandle: 'mockReceiptHandle',
        attributes: {
          ApproximateReceiveCount: '2',
          SentTimestamp: '202601021513',
          SenderId: 'mockSenderId',
          ApproximateFirstReceiveTimestamp: '202601021513',
        },
        messageAttributes: {},
        md5OfBody: 'mockMd5OfBody',
        md5OfMessageAttributes: 'mockMd5OfMessageAttributes',
        eventSource: 'aws:sqs',
        eventSourceARN: 'mockEventSourceARN',
        awsRegion: 'eu-west2',
        body: mockMessageBody_2,
      },
    ],
  };

  const mockPartialFailedEvent: QueueEvent<IMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
          // Missed out on purpose NotificationTitle, NotificationBody
        },
      },
      {
        messageId: 'mockMessageId_2',
        receiptHandle: 'mockReceiptHandle',
        attributes: {
          ApproximateReceiveCount: '2',
          SentTimestamp: '202601021513',
          SenderId: 'mockSenderId',
          ApproximateFirstReceiveTimestamp: '202601021513',
        },
        messageAttributes: {},
        md5OfBody: 'mockMd5OfBody',
        md5OfMessageAttributes: 'mockMd5OfMessageAttributes',
        eventSource: 'aws:sqs',
        eventSourceARN: 'mockEventSourceARN',
        awsRegion: 'eu-west2',
        body: mockMessageBody_2,
      },
    ],
  } as unknown as QueueEvent<IMessage>;

  const mockFailedEvent: QueueEvent<IMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
          // Missed out on purpose NotificationTitle, NotificationBody
        },
      },
    ],
  } as unknown as QueueEvent<IMessage>;

  const mockUnidentifiableEvent: QueueEvent<IMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          // Set DepartmentID to undefined on purpose
          UserID: 'invalid-id',
          DepartmentID: undefined,
          NotificationTitle: 'Boom',
          NotificationBody: 'psst',
        },
      },
    ],
  } as unknown as QueueEvent<IMessage>;

  beforeEach(async () => {
    // Reset all mocks
    vi.resetAllMocks();
    vi.useRealTimers();
    smMock.reset();
    smMock.on(GetSecretValueCommand).resolvesOnce({
      SecretString: JSON.stringify({
        apiAccountId: `abc`,
        apiKey: `cde`,
        apiUrl: `efg`,
        consumerRoleArn: `hij`,
        region: `eu-west-2`,
      }),
    });

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions]
    serviceMocks.dispatchQueueServiceMock.publishMessage.mockResolvedValue(undefined);
    serviceMocks.notificationsDynamoRepositoryMock.updateRecord.mockResolvedValue(undefined);

    await serviceMocks.analyticsQueueServiceMock.initialize();
    instance = new Processing(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      notificationsRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      dispatchQueue: serviceMocks.dispatchQueueServiceMock.initialize(),
      processingService: serviceMocks.processingServiceMock.initialize(),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('processing');
  });

  it.each([
    [`true`, `false`],
    [`false`, `true`],
  ])(
    'should obey SSM Enabled flags Common: %s Processing: %s',
    async (commonEnabled: string, processingEnabled: string) => {
      // Arrange
      mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
      if (processingEnabled == `false`) {
        mockParameterStore[BoolParameters.Config.Processing.Enabled] = processingEnabled;
      }

      // Act & Assert
      await expect(handler(mockEvent, mockContext)).rejects.toThrow(
        new Error(
          `Function disabled due to config/common/enabled or config/processing/enabled SSM param being toggled off`
        )
      );
    }
  );

  it('should publish analytics events', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      1,
      {
        DepartmentID: mockMessageBody_1.DepartmentID,
        NotificationID: mockMessageBody_1.NotificationID,
        UserID: mockMessageBody_1.UserID,
      },
      'PROCESSING'
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      2,
      {
        DepartmentID: mockMessageBody_1.DepartmentID,
        MessageBody: mockMessageBody_1.MessageBody,
        MessageTitle: mockMessageBody_1.MessageTitle,
        NotificationBody: mockMessageBody_1.NotificationBody,
        NotificationID: mockMessageBody_1.NotificationID,
        NotificationTitle: mockMessageBody_1.NotificationTitle,
        UserID: mockMessageBody_1.UserID,
      },
      'PROCESSED'
    );
  });

  it('should update data in the notifications message table', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        DepartmentID: mockMessageBody_1.DepartmentID,
        NotificationID: mockMessageBody_1.NotificationID,
        UserID: mockMessageBody_1.UserID,
        ExternalUserID: mockMessageBody_1.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
        ProcessedDateTime: date.toISOString(),
      })
    );
  });

  it('should send processed message to the dispatch queue when message is successfully processed.', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: mockMessageBody_1.DepartmentID,
      MessageBody: mockMessageBody_1.MessageBody,
      MessageTitle: mockMessageBody_1.MessageTitle,
      NotificationBody: mockMessageBody_1.NotificationBody,
      NotificationID: mockMessageBody_1.NotificationID,
      NotificationTitle: mockMessageBody_1.NotificationTitle,
      UserID: mockMessageBody_1.UserID,
      ExternalUserID: mockMessageBody_1.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
    });
  });

  it('should processes multiple messages to the dispatch queue when messages are successfully processed.', async () => {
    // Act
    await handler(mockEvents, mockContext);

    // Assert
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: mockMessageBody_1.DepartmentID,
      MessageBody: mockMessageBody_1.MessageBody,
      MessageTitle: mockMessageBody_1.MessageTitle,
      NotificationBody: mockMessageBody_1.NotificationBody,
      NotificationID: mockMessageBody_1.NotificationID,
      NotificationTitle: mockMessageBody_1.NotificationTitle,
      UserID: mockMessageBody_1.UserID,
      ExternalUserID: mockMessageBody_1.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
    });
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: mockMessageBody_2.DepartmentID,
      MessageBody: mockMessageBody_2.MessageBody,
      MessageTitle: mockMessageBody_2.MessageTitle,
      NotificationBody: mockMessageBody_2.NotificationBody,
      NotificationID: mockMessageBody_2.NotificationID,
      NotificationTitle: mockMessageBody_2.NotificationTitle,
      UserID: mockMessageBody_2.UserID,
      ExternalUserID: mockMessageBody_2.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
    });
  });

  it('should return a list of all failed processes when it partial fails.', async () => {
    // Act
    const result = await handler(mockPartialFailedEvent, mockContext);

    // Assert
    expect(result).toEqual({
      batchItemFailures: [
        {
          itemIdentifier: 'mockMessageId_1',
        },
      ],
    });
  });

  it('should return and error publish an event when message body is not valid.', async () => {
    // Act
    const result = handler(mockFailedEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: mockFailedEvent.Records[0].body.NotificationID,
        DepartmentID: mockFailedEvent.Records[0].body.DepartmentID,
      },
      NotificationStateEnum.PROCESSING_FAILED,
      '✖ Invalid input: expected string, received undefined\n  → at body.NotificationTitle\n✖ Invalid input: expected string, received undefined\n  → at body.NotificationBody'
    );
  });

  it('should return and error and not trigger analytics for unidentifiable events', async () => {
    // Act
    const result = handler(mockUnidentifiableEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).not.toHaveBeenCalled();
  });

  it('should log when a message has no NotificationID or DepartmentID', async () => {
    // Act
    const result = handler(mockUnidentifiableEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(
      `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
      {
        error: '✖ Invalid input: expected string, received undefined\n  → at body.DepartmentID',
        raw: mockUnidentifiableEvent.Records[0].body,
      }
    );
  });

  it('should log when processing adapter call returns success = false.', async () => {
    // Arrange
    const errorMsg = 'Mock UDP failure message.';
    serviceMocks.processingServiceMock.send.mockResolvedValueOnce({
      request: {
        userID: mockEvent.Records[0].body.UserID,
      },
      success: false,
      errors: [errorMsg],
    });

    // Act
    const result = handler(mockEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`UDP Error:`, { errors: [errorMsg] });
  });

  it('should log when processing adapter throws an error.', async () => {
    // Arrange
    const errorMsg = 'Mock UDP error.';
    serviceMocks.processingServiceMock.send.mockRejectedValueOnce(errorMsg);

    // Act
    const result = handler(mockEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`UDP Error:`, { e: errorMsg });
  });
});
