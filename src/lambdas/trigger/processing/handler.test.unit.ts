/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { QueueEvent } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories/inboundDynamoRepository';
import { AnalyticsService, ConfigurationService } from '@common/services';
import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { DispatchQueueService } from '@common/services/dispatchQueueService';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Processing } from '@project/lambdas/trigger/processing/handler';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

const sqsMock = mockClient(SQSClient);

describe('Processing QueueHandler', () => {
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
  const dispatchQueueService = vi.mocked(new DispatchQueueService(configMock, loggerMock, metricsMock, tracerMock));

  let instance: Processing;

  // Data presets
  const mockContext: Context = {
    functionName: 'processing',
    awsRequestId: '12345',
  } as unknown as Context;
  const mockMessageBody: IMessage = {
    NotificationID: '1234',
    DepartmentID: 'DVLA01',
    UserID: 'UserID',
    NotificationTitle: 'Hey',
    NotificationBody: "You've got a message in the message centre",
    MessageTitle: '',
    MessageBody: '',
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
    // Reset all mocks
    vi.clearAllMocks();
    configMock.getParameter.mockResolvedValueOnce(`sqsurl/sqsname`);
    await analyticsQueueServiceMock.initialize();
    instance = new Processing(configMock, loggerMock, metricsMock, tracerMock, () => ({
      analyticsService: Promise.resolve(analyticsServiceMock),
      inboundTable: Promise.resolve(inboundDynamoMock),
      dispatchQueue: dispatchQueueService.initialize(),
    }));
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('processing');
  });

  it.each([
    [`enabled`, `disabled`],
    [`disabled`, `enabled`],
  ])('should obey SSM Enabled flags Common: %s Processing: %s', async (commonEnabled: string, processing: string) => {
    // Arrange
    configMock.getParameter.mockResolvedValue('');
    configMock.getParameter.mockResolvedValue('');
    dispatchQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
    dispatchQueueService.publishMessage.mockResolvedValueOnce(undefined);
    dispatchQueueService.publishMessage.mockResolvedValueOnce(undefined);
    inboundDynamoMock.updateRecord.mockResolvedValueOnce(undefined);
    analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    configMock.getBooleanParameter.mockResolvedValueOnce(commonEnabled == `enabled`);
    if (processing == `disabled`) {
      configMock.getBooleanParameter.mockResolvedValueOnce((processing as string) == `enabled`);
    }

    // Act & assert
    await expect(instance.implementation(mockEvent, mockContext)).rejects.toThrow(
      new Error(
        `Function disabled due to config/common/enabled or config/processing/enabled SSM param being toggled off`
      )
    );
  });

  it('should publish analytics events', async () => {
    // Arrange
    configMock.getParameter.mockResolvedValue('');
    dispatchQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
    dispatchQueueService.publishMessage.mockResolvedValueOnce(undefined);
    dispatchQueueService.publishMessage.mockResolvedValueOnce(undefined);
    inboundDynamoMock.createRecordBatch.mockResolvedValueOnce(undefined);
    analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    configMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(analyticsServiceMock.publishMultipleEvents).toHaveBeenNthCalledWith(
      1,
      [
        {
          DepartmentID: mockMessageBody.DepartmentID,
          NotificationID: mockMessageBody.NotificationID,
          UserID: mockMessageBody.UserID,
        },
      ],
      'PROCESSING'
    );
    expect(analyticsServiceMock.publishMultipleEvents).toHaveBeenNthCalledWith(
      2,
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
      'PROCESSED'
    );
  });

  it('should update data in the inbound message table', async () => {
    // Arrange
    configMock.getParameter.mockResolvedValue('');
    dispatchQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
    dispatchQueueService.publishMessage.mockResolvedValueOnce(undefined);
    dispatchQueueService.publishMessage.mockResolvedValueOnce(undefined);
    inboundDynamoMock.updateRecord.mockResolvedValueOnce(undefined);
    analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    configMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(inboundDynamoMock.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        DepartmentID: mockMessageBody.DepartmentID,
        NotificationID: mockMessageBody.NotificationID,
        UserID: mockMessageBody.UserID,
        ExternalUserID: mockMessageBody.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
        ProcessedDateTime: expect.any(String),
      })
    );
  });

  it('should trigger analytics for failure events', async () => {
    // Arrange
    configMock.getParameter.mockResolvedValue('');
    dispatchQueueService.publishMessageBatch.mockResolvedValueOnce(undefined);
    dispatchQueueService.publishMessage.mockResolvedValueOnce(undefined);
    dispatchQueueService.publishMessage.mockResolvedValueOnce(undefined);
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
      'PROCESSING'
    );
  });
});
