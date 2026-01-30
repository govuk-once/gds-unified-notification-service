/* eslint-disable @typescript-eslint/unbound-method */
import { SQSClient } from '@aws-sdk/client-sqs';
import { QueueEvent } from '@common/operations';
import { injectObservabilityMocks, injectServiceMocks } from '@common/utils/testServices';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Validation } from '@project/lambdas/trigger/validation/handler';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

mockClient(SQSClient);

describe('Validation QueueHandler', () => {
  let instance: Validation;

  const observabilityMocks = injectObservabilityMocks();
  const serviceMocks = injectServiceMocks(observabilityMocks);

  // Data presents
  const mockContext: Context = {
    functionName: 'validation',
    awsRequestId: '12345',
  } as unknown as Context;

  const mockMessageBody: IMessage = {
    NotificationID: '1234',
    DepartmentID: 'TEST01',
    UserID: 'UserID',
    NotificationTitle: 'Hi there',
    NotificationBody: 'You have a new message in the message center',
    MessageTitle: 'Hi there',
    MessageBody: 'MOCK_LONG_MESSAGE',
  };

  const mockEvent: QueueEvent<IMessage> = {
    Records: [
      {
        messageId: 'mockMessageId',
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
        body: mockMessageBody,
      },
    ],
  };

  const mockFailedEvent: QueueEvent<IMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          NotificationID: 'invalid-id',
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
          // Set NotificationID to undefined on purpose
          NotificationID: undefined,
          UserID: 'invalid-id',
          ExternalUserID: 'test',
          DepartmentID: 'invalid-id',
          NotificationTitle: 'Boom',
          NotificationBody: 'psst',
        },
      },
    ],
  } as unknown as QueueEvent<IMessage>;

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`sqsurl/sqsname`);

    await serviceMocks.analyticsQueueServiceMock.initialize();
    instance = new Validation(
      serviceMocks.configurationServiceMock,
      observabilityMocks.loggerMock,
      observabilityMocks.metricsMock,
      observabilityMocks.tracerMock,
      () => ({
        analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
        inboundTable: Promise.resolve(serviceMocks.inboundDynamoRepositoryMock),
        processingQueue: serviceMocks.processingQueueServiceMock.initialize(),
      })
    );
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('validation');
  });

  it.each([
    [`enabled`, `disabled`],
    [`disabled`, `enabled`],
  ])(
    'should obey SSM Enabled flags Common: %s Validation: %s',
    async (commonEnabled: string, validationEnabled: string) => {
      // Arrange
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
      serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
      serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
      serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
      serviceMocks.inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
      serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
      serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(commonEnabled == `enabled`);
      if (validationEnabled == `disabled`) {
        serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(
          (validationEnabled as string) == `enabled`
        );
      }

      // Act & assert
      await expect(instance.implementation(mockEvent, mockContext)).rejects.toThrow(
        new Error(
          `Function disabled due to config/common/enabled or config/validation/enabled SSM param being toggled off`
        )
      );
    }
  );

  it('should publish analytics events', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
    serviceMocks.inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [
        {
          DepartmentID: mockMessageBody.DepartmentID,
          NotificationID: mockMessageBody.NotificationID,
          UserID: mockMessageBody.UserID,
        },
      ],
      'VALIDATING'
    );
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [
        {
          DepartmentID: mockMessageBody.DepartmentID,
          MessageBody: mockMessageBody.MessageBody,
          MessageTitle: mockMessageBody.MessageTitle,
          NotificationBody: mockMessageBody.NotificationBody,
          NotificationID: mockMessageBody.NotificationID,
          NotificationTitle: mockMessageBody.NotificationTitle,
          UserID: mockMessageBody.UserID,
        },
      ],
      'VALIDATED'
    );
  });

  it('should send a message to processing queue', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
    serviceMocks.inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
  });

  it('should store data in the inbound message table', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
    serviceMocks.inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.inboundDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: '202601021513',
      }),
    ]);
  });

  it('should trigger analytics for failure events', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);
    serviceMocks.inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockFailedEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenNthCalledWith(
      1,
      [
        {
          NotificationID: 'invalid-id',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
        },
      ],
      'VALIDATING'
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      1,
      {
        NotificationID: 'invalid-id',
        DepartmentID: 'invalid-id',
      },
      'VALIDATION_FAILED',
      expect.any(Object)
    );
  });

  it('should log when a message has no NotificationID or DepartmentID', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);
    serviceMocks.inboundDynamoRepositoryMock.updateRecord.mockResolvedValueOnce(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockUnidentifiableEvent, mockContext);

    // Assert
    expect(observabilityMocks.loggerMock.info).toHaveBeenCalledWith(
      `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
      {
        errors: {
          fieldErrors: {
            // TODO: Should be NotificationID
            body: ['Invalid input: expected string, received undefined'],
          },
          formErrors: [],
        },
        raw: mockUnidentifiableEvent.Records[0],
      }
    );
  });
});
