import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetDynamoRepository, iocGetQueueService } from '@common/ioc';
import { QueueEvent } from '@common/operations';
import { IStoreMessageRepository } from '@common/repositories/interfaces/IStoreMessageRepository';
import { Configuration, QueueService } from '@common/services';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Validation } from '@project/lambdas/trigger/validation/handler';
import { Context } from 'aws-lambda';

vi.mock('@common/ioc', () => ({
  iocGetConfigurationService: vi.fn(),
  iocGetDynamoRepository: vi.fn(),
  iocGetQueueService: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));

describe('Validation QueueHandler', () => {
  const getParameter = vi.fn();
  const publishMessage = vi.fn();
  const publishMessageBatch = vi.fn();
  const createRecord = vi.fn();
  const trace = vi.fn();
  const error = vi.fn();

  const mockQueue = {
    publishMessageBatch: publishMessageBatch,
    publishMessage: publishMessage,
  } as unknown as QueueService;

  const mockDynamo = {
    createRecord: createRecord,
  } as unknown as IStoreMessageRepository;

  let mockContext: Context;
  let mockEvent: QueueEvent<IMessage>;
  let mockMessageBody: IMessage;
  let instance: Validation;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    instance = new Validation(
      { getParameter } as unknown as Configuration,
      { trace, error } as unknown as Logger,
      {} as unknown as Metrics,
      {} as unknown as Tracer
    );

    vi.mocked(iocGetQueueService).mockReturnValue(mockQueue);
    vi.mocked(iocGetDynamoRepository).mockReturnValue(mockDynamo);

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
      MessageTitleFull: 'You have a new medical driving license',
      MessageBodyFull: 'The DVLA has issued you a new license.',
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
    const mockProcessingQueueUrl = 'mockProcessingQueueUrl';
    const mockIncomingMessageTableName = 'mockIncomingMessageTableName';
    const mockAnalyticsQueueUrl = 'mockAnalyticsQueueUrl';

    getParameter.mockResolvedValueOnce(mockProcessingQueueUrl);
    getParameter.mockResolvedValueOnce(mockIncomingMessageTableName);
    getParameter.mockResolvedValueOnce(mockAnalyticsQueueUrl);
    publishMessageBatch.mockResolvedValueOnce(undefined);
    createRecord.mockResolvedValueOnce(undefined);
    publishMessage.mockResolvedValueOnce(undefined);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(getParameter).toHaveBeenCalledTimes(3);
    expect(iocGetQueueService).toHaveBeenNthCalledWith(1, mockProcessingQueueUrl);
    expect(publishMessageBatch).toHaveBeenCalledWith([
      [
        {
          Title: {
            DataType: 'String',
            StringValue: 'Test title',
          },
        },
        mockMessageBody,
      ],
    ]);
    expect(iocGetDynamoRepository).toHaveBeenCalledWith(mockIncomingMessageTableName);
    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: '202601021513',
      })
    );
    expect(iocGetQueueService).toHaveBeenNthCalledWith(2, mockAnalyticsQueueUrl);
    expect(publishMessage).toHaveBeenCalledWith(
      {
        Title: {
          DataType: 'String',
          StringValue: 'From validation lambda',
        },
      },
      'Test message body.'
    );
  });

  it('should handle when a message is not parsed, send all parsed message and make a record of both validated and failed messages.', async () => {
    // Arrange
    const mockProcessingQueueUrl = 'mockProcessingQueueUrl';
    const mockIncomingMessageTableName = 'mockIncomingMessageTableName';
    const mockAnalyticsQueueUrl = 'mockAnalyticsQueueUrl';

    getParameter.mockResolvedValueOnce(mockProcessingQueueUrl);
    getParameter.mockResolvedValueOnce(mockIncomingMessageTableName);
    getParameter.mockResolvedValueOnce(mockAnalyticsQueueUrl);
    publishMessageBatch.mockResolvedValueOnce(undefined);
    createRecord.mockResolvedValueOnce(undefined);
    createRecord.mockResolvedValueOnce(undefined);
    publishMessage.mockResolvedValueOnce(undefined);

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
    expect(getParameter).toHaveBeenCalledTimes(3);
    expect(iocGetQueueService).toHaveBeenNthCalledWith(1, mockProcessingQueueUrl);
    expect(publishMessageBatch).toHaveBeenCalledWith([
      [
        {
          Title: {
            DataType: 'String',
            StringValue: 'Test title',
          },
        },
        mockMessageBody,
      ],
    ]);
    expect(iocGetDynamoRepository).toHaveBeenCalledWith(mockIncomingMessageTableName);
    expect(createRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        NotificationID: '1231',
        ReceivedDateTime: '202601021513',
        UserID: 'UserID',
      })
    );
    expect(createRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: '202601021513',
      })
    );
    expect(iocGetQueueService).toHaveBeenNthCalledWith(2, mockAnalyticsQueueUrl);
    expect(publishMessage).toHaveBeenCalledWith(
      {
        Title: {
          DataType: 'String',
          StringValue: 'From validation lambda',
        },
      },
      'Test message body.'
    );
  });

  it('should set queue url to an empty string if not set and get an error from queue service.', async () => {
    // Arrange
    const error = new Error('SQS Publish Error: Queue Url Does not Exist');

    vi.mocked(iocGetQueueService).mockImplementationOnce(() => {
      throw error;
    });
    getParameter.mockResolvedValueOnce(undefined);

    // Act
    const result = instance.implementation(mockEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(error);
    expect(iocGetQueueService).toHaveBeenCalledWith('');
  });

  it('should set table name to an empty string if not set and get an error from dynamo repo.', async () => {
    // Arrange
    const mockProcessingQueueUrl = 'mockProcessingQueueUrl';
    const error = new Error('Failure in creating record table: . \nError: No table matching table name');

    vi.mocked(iocGetDynamoRepository).mockImplementationOnce(() => {
      throw error;
    });
    getParameter.mockResolvedValueOnce(mockProcessingQueueUrl);
    getParameter.mockResolvedValueOnce(undefined);

    // Act
    const result = instance.implementation(mockEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(error);
    expect(iocGetDynamoRepository).toHaveBeenCalledWith('');
  });
});
