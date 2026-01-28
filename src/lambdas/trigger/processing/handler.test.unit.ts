import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIMessageRecord } from '@common/builders/toIMessageRecord';
import { iocGetAnalyticsQueueService, iocGetDispatchQueueService, iocGetInboundDynamoRepository } from '@common/ioc';
import { QueueEvent } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories/inboundDynamoRepository';
import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { DispatchQueueService } from '@common/services/dispatchQueueService';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Processing } from '@project/lambdas/trigger/processing/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

// TODO: Investigate a way to mock the classes
vi.mock('@common/ioc', () => ({
  iocGetInboundDynamoRepository: vi.fn(),
  iocGetDispatchQueueService: vi.fn(),
  iocGetAnalyticsQueueService: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));

vi.mock('@common/builders/toIMessageRecord', () => ({
  toIMessageRecord: vi.fn(),
}));

describe('Processing QueueHandler', () => {
  let instance: Processing;

  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  const publishMessage = vi.fn();
  const publishMessageBatch = vi.fn();
  const updateRecord = vi.fn();

  const mockDispatchQueueService = {
    publishMessageBatch: publishMessageBatch,
    publishMessage: publishMessage,
  } as unknown as DispatchQueueService;

  const mockAnalyticsQueue = {
    publishMessageBatch: publishMessageBatch,
    publishMessage: publishMessage,
  } as unknown as AnalyticsQueueService;

  const mockDynamo = {
    updateRecord: updateRecord,
  } as unknown as InboundDynamoRepository;

  let mockContext: Context;
  let mockMessageBody: IMessage;
  let mockEvent: QueueEvent<IMessage>;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    vi.mocked(iocGetInboundDynamoRepository).mockResolvedValue(mockDynamo);
    vi.mocked(iocGetDispatchQueueService).mockResolvedValue(mockDispatchQueueService);
    vi.mocked(iocGetAnalyticsQueueService).mockResolvedValue(mockAnalyticsQueue);

    instance = new Processing(loggerMock, metricsMock, tracerMock);

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'processing',
      awsRequestId: '12345',
    } as unknown as Context;

    // Mock the MessageBody
    mockMessageBody = {
      NotificationID: '1234',
      DepartmentID: 'DVLA01',
      UserID: 'UserID',
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new medical driving license',
      NotificationBody: 'The DVLA has issued you a new license.',
    };

    // Mock the QueueEvent (Mapping to your InputType)
    mockEvent = {
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
          eventSource: 'mockEventSource',
          eventSourceARN: 'mockEventSourceARN',
          awsRegion: 'eu-west2',
          body: mockMessageBody,
        },
      ],
    };
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('processing');
  });

  it('should retrieve ExternalUserID for each message, update record in dynamo, and send message to dispatch queue.', async () => {
    // Arrange
    publishMessageBatch.mockResolvedValueOnce(undefined);
    updateRecord.mockResolvedValueOnce(undefined);
    publishMessage.mockResolvedValueOnce(undefined);

    vi.mocked(toIMessageRecord).mockReturnValueOnce({
      NotificationID: '1234',
      ExternalUserID: 'OneSignal-1234',
      ProcessedDateTime: new Date('1768992347422'),
    });

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(iocGetInboundDynamoRepository).toHaveBeenCalled();
    expect(iocGetDispatchQueueService).toBeCalled();
    expect(iocGetAnalyticsQueueService).toHaveBeenCalled();
    expect(publishMessageBatch).toHaveBeenNthCalledWith(1, [
      {
        ...mockMessageBody,
        ExternalUserID: `OneSignal-${mockMessageBody.NotificationID}`,
      },
    ]);
    expect(updateRecord).toHaveBeenCalledWith({
      NotificationID: '1234',
      ExternalUserID: 'OneSignal-1234',
      ProcessedDateTime: expect.any(Date),
    });
    expect(publishMessage).toHaveBeenCalledWith('Test message body.');
  });

  it('should handle if message are failed to be mapped to message record.', async () => {
    // Arrange
    publishMessageBatch.mockResolvedValueOnce(undefined);
    updateRecord.mockResolvedValueOnce(undefined);
    publishMessage.mockResolvedValueOnce(undefined);
    vi.mocked(toIMessageRecord).mockReturnValueOnce(undefined);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(iocGetInboundDynamoRepository).toHaveBeenCalled();
    expect(iocGetDispatchQueueService).toBeCalled();
    expect(iocGetAnalyticsQueueService).toHaveBeenCalled();
    expect(publishMessageBatch).toHaveBeenNthCalledWith(1, [
      {
        ...mockMessageBody,
        ExternalUserID: `OneSignal-${mockMessageBody.NotificationID}`,
      },
    ]);
    expect(updateRecord).not.toHaveBeenCalled();
    expect(publishMessage).toHaveBeenCalledWith('Test message body.');
  });
});
