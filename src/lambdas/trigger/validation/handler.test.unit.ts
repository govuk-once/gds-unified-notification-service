/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { QueueEvent } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories';
import {
  AnalyticsQueueService,
  AnalyticsService,
  ConfigurationService,
  ProcessingQueueService,
} from '@common/services';
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

  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());
  const configMock = vi.mocked(new ConfigurationService(loggerMock, metricsMock, tracerMock));

  const inboundDynamoMock = vi.mocked(new InboundDynamoRepository(configMock, loggerMock, metricsMock, tracerMock));
  const analyticsQueueServiceMock = vi.mocked(
    new AnalyticsQueueService(configMock, loggerMock, metricsMock, tracerMock)
  );
  const analyticsServiceMock = vi.mocked(
    new AnalyticsService(loggerMock, metricsMock, tracerMock, analyticsQueueServiceMock)
  );
  const processingQueueService = vi.mocked(new ProcessingQueueService(configMock, loggerMock, metricsMock, tracerMock));

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

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    configMock.getParameter.mockResolvedValueOnce(`sqsurl/sqsname`);

    await analyticsQueueServiceMock.initialize();
    instance = new Validation(configMock, loggerMock, metricsMock, tracerMock, () => ({
      analyticsService: Promise.resolve(analyticsServiceMock),
      inboundTable: Promise.resolve(inboundDynamoMock),
      processingQueue: processingQueueService.initialize(),
    }));
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
      configMock.getParameter.mockResolvedValue('');
      processingQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
      processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
      processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
      inboundDynamoMock.createRecordBatch.mockResolvedValueOnce(undefined);
      analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
      configMock.getBooleanParameter.mockResolvedValueOnce(commonEnabled == `enabled`);
      if (validationEnabled == `disabled`) {
        configMock.getBooleanParameter.mockResolvedValueOnce((validationEnabled as string) == `enabled`);
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
    configMock.getParameter.mockResolvedValue('');
    processingQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
    processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
    processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
    inboundDynamoMock.createRecordBatch.mockResolvedValueOnce(undefined);
    analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    configMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [
        {
          DepartmentID: mockMessageBody.DepartmentID,
          NotificationID: mockMessageBody.NotificationID,
          UserID: mockMessageBody.UserID,
        },
      ],
      'VALIDATING'
    );
    expect(analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
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
    configMock.getParameter.mockResolvedValue('');
    processingQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
    processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
    processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
    inboundDynamoMock.createRecordBatch.mockResolvedValueOnce(undefined);
    analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    configMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(processingQueueService.publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
  });

  it('should store data in the inbound message table', async () => {
    // Arrange
    configMock.getParameter.mockResolvedValue('');
    processingQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
    processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
    processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
    inboundDynamoMock.createRecordBatch.mockResolvedValueOnce(undefined);
    analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    configMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(inboundDynamoMock.createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: '202601021513',
      }),
    ]);
  });

  it('should trigger analytics for failure events', async () => {
    // Arrange
    configMock.getParameter.mockResolvedValue('');
    processingQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
    processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
    processingQueueService.publishMessage.mockResolvedValueOnce(undefined);
    inboundDynamoMock.createRecordBatch.mockResolvedValueOnce(undefined);
    analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    analyticsServiceMock.publishEvent.mockResolvedValue(undefined);
    configMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockFailedEvent, mockContext);

    // Assert
    expect(analyticsServiceMock.publishMultipleEvents).toHaveBeenNthCalledWith(
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
    expect(analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      1,
      {
        NotificationID: 'invalid-id',
        DepartmentID: 'invalid-id',
      },
      'VALIDATION_FAILED',
      expect.any(Object)
    );
  });
});
