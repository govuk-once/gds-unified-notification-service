import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIMessageRecord } from '@common/builders/toIMessageRecord';
import { iocGetAnalyticsQueueService, iocGetInboundDynamoRepository, iocGetProcessingQueueService } from '@common/ioc';
import { QueueEvent } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories/dynamodbRepository';
import { AnalyticsQueueService, ProcessingQueueService } from '@common/services';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Validation } from '@project/lambdas/trigger/validation/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/ioc', () => ({
  iocGetInboundDynamoRepository: vi.fn(),
  iocGetProcessingQueueService: vi.fn(),
  iocGetAnalyticsQueueService: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));
vi.mock('@common/builders/toIMessageRecord', () => ({
  toIMessageRecord: vi.fn(),
}));

describe('Validation QueueHandler', () => {
  let instance: Validation;

  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  const publishMessage = vi.fn();
  const publishMessageBatch = vi.fn();
  const createRecord = vi.fn();
  const createRecordBatch = vi.fn();

  const mockProcessingQueue = {
    publishMessageBatch: publishMessageBatch,
    publishMessage: publishMessage,
  } as unknown as ProcessingQueueService;

  const mockAnalyticsQueue = {
    publishMessageBatch: publishMessageBatch,
    publishMessage: publishMessage,
  } as unknown as AnalyticsQueueService;

  const mockDynamo = {
    createRecord: createRecord,
    createRecordBatch: createRecordBatch,
  } as unknown as InboundDynamoRepository;

  let mockContext: Context;
  let mockEvent: QueueEvent<IMessage>;
  let mockMessageBody: IMessage;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    instance = new Validation(loggerMock, metricsMock, tracerMock);

    vi.mocked(iocGetInboundDynamoRepository).mockResolvedValue(mockDynamo);
    vi.mocked(iocGetProcessingQueueService).mockResolvedValue(mockProcessingQueue);
    vi.mocked(iocGetAnalyticsQueueService).mockResolvedValue(mockAnalyticsQueue);

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'validation',
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
    expect(instance.operationId).toBe('validation');
  });

  it('should send a message to processing queue when implementation is called and send a message to the analytics queue when triggered.', async () => {
    // Arrange
    publishMessageBatch.mockResolvedValueOnce(undefined);
    createRecordBatch.mockResolvedValueOnce(undefined);
    publishMessage.mockResolvedValueOnce(undefined);

    vi.mocked(toIMessageRecord).mockReturnValueOnce({
      ...mockMessageBody,
      ReceivedDateTime: '202601021513',
    });

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(iocGetProcessingQueueService).toHaveBeenCalled();
    expect(iocGetInboundDynamoRepository).toHaveBeenCalled();
    expect(iocGetAnalyticsQueueService).toHaveBeenCalled();
    expect(publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
    expect(createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: '202601021513',
      }),
    ]);
    expect(publishMessage).toHaveBeenCalledWith('Test message body.');
  });

  it('should handle when a message is not parsed, send all parsed message and make a record of both validated and failed messages.', async () => {
    // Arrange
    publishMessageBatch.mockResolvedValueOnce(undefined);
    createRecordBatch.mockResolvedValueOnce(undefined);
    createRecordBatch.mockResolvedValueOnce(undefined);
    publishMessage.mockResolvedValueOnce(undefined);

    vi.mocked(toIMessageRecord).mockReturnValueOnce({
      NotificationID: '1231',
      UserID: 'UserID',
      ReceivedDateTime: '202601021513',
    });
    vi.mocked(toIMessageRecord).mockReturnValueOnce({
      ...mockMessageBody,
      ReceivedDateTime: '202601021513',
    });

    const mockPartialFailedEvent: QueueEvent<unknown> = {
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
          body: {
            NotificationID: '1231',
            UserID: 'UserID',
          },
        },
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

    // Act
    await instance.implementation(mockPartialFailedEvent, mockContext);

    // Assert
    expect(iocGetProcessingQueueService).toHaveBeenCalled();
    expect(iocGetInboundDynamoRepository).toHaveBeenCalled();
    expect(iocGetAnalyticsQueueService).toHaveBeenCalled();
    expect(publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
    expect(createRecordBatch).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        NotificationID: '1231',
        ReceivedDateTime: '202601021513',
        UserID: 'UserID',
      }),
    ]);
    expect(createRecordBatch).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: '202601021513',
      }),
    ]);
    expect(publishMessage).toHaveBeenCalledWith('Test message body.');
  });

  it('should handle when a message is not parsed, and make a record of failed messages.', async () => {
    // Arrange
    createRecordBatch.mockResolvedValueOnce(undefined);
    publishMessage.mockResolvedValueOnce(undefined);

    vi.mocked(toIMessageRecord).mockReturnValueOnce({
      NotificationID: '1231',
      UserID: 'UserID',
      ReceivedDateTime: '202601021513',
    });
    vi.mocked(toIMessageRecord).mockReturnValueOnce({
      NotificationID: '1232',
      UserID: 'UserID-1',
      ReceivedDateTime: '202601021513',
    });

    const mockPartialFailedEvent: QueueEvent<unknown> = {
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
          body: {
            NotificationID: '1231',
            UserID: 'UserID',
          },
        },
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
          body: {
            NotificationID: '1232',
            UserID: 'UserID-1',
          },
        },
      ],
    };

    // Act
    await instance.implementation(mockPartialFailedEvent, mockContext);

    // Assert
    expect(iocGetProcessingQueueService).toHaveBeenCalled();
    expect(iocGetInboundDynamoRepository).toHaveBeenCalled();
    expect(iocGetAnalyticsQueueService).toHaveBeenCalled();
    expect(publishMessageBatch).not.toHaveBeenCalled();
    expect(createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        NotificationID: '1231',
        ReceivedDateTime: '202601021513',
        UserID: 'UserID',
      }),
      expect.objectContaining({
        NotificationID: '1232',
        ReceivedDateTime: '202601021513',
        UserID: 'UserID-1',
      }),
    ]);
    expect(publishMessage).toHaveBeenCalledWith('Test message body.');
  });

  it('should handle when a message is not parse and has not notification id.', async () => {
    // Arrange
    vi.mocked(toIMessageRecord).mockImplementationOnce(() => undefined);
    publishMessage.mockResolvedValueOnce(undefined);

    const mockFailedEvent: QueueEvent<unknown> = {
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
          body: {
            UserID: 'UserID-1',
          },
        },
      ],
    };

    // Act
    await instance.implementation(mockFailedEvent, mockContext);

    // Assert
    expect(publishMessageBatch).not.toBeCalled();
    expect(createRecordBatch).not.toBeCalled();
  });

  it('should x.', async () => {
    // Arrange
    const mockFailedEvent: QueueEvent<unknown> = {
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
          body: {
            UserID: 'UserID-1',
          },
        },
      ],
    };

    // Act
    await instance.implementation(mockFailedEvent, mockContext);

    // Assert
    expect(publishMessageBatch).not.toBeCalled();
    expect(createRecordBatch).not.toBeCalled();
  });
});
