import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIMessageRecord } from '@common/builders/IMessageRecord';
import { iocGetDynamoRepository, iocGetQueueService } from '@common/ioc';
import { QueueEvent } from '@common/operations';
import { IDynamodbRepository } from '@common/repositories/interfaces/IDynamodbRepository';
import { Configuration } from '@common/services/configuration';
import { QueueService } from '@common/services/queueService';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Processing } from '@project/lambdas/trigger/processing/handler';
import { Context } from 'aws-lambda';

vi.mock('@common/ioc', () => ({
  iocGetConfigurationService: vi.fn(),
  iocGetQueueService: vi.fn(),
  iocGetDynamoRepository: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));

vi.mock('@common/builders/IMessageRecord', () => ({
  toIMessageRecord: vi.fn(),
}));

describe('Processing QueueHandler', () => {
  const getParameter = vi.fn();
  const publishMessage = vi.fn();
  const publishMessageBatch = vi.fn();
  const updateRecord = vi.fn();
  const info = vi.fn();

  const instance: Processing = new Processing(
    { getParameter } as unknown as Configuration,
    { info } as unknown as Logger,
    {} as unknown as Metrics,
    {} as unknown as Tracer
  );
  const mockQueue = {
    publishMessage: publishMessage,
    publishMessageBatch: publishMessageBatch,
  } as unknown as QueueService;

  const mockDynamo = {
    updateRecord: updateRecord,
  } as unknown as IDynamodbRepository;

  let mockContext: Context;
  let mockMessageBody: IMessage;
  let mockEvent: QueueEvent<IMessage>;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

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

  it('should log send a message to processing queue when implementation is called and send a message to the analytics queue when triggered.', async () => {
    // Arrange
    const mockDispatchQueueUrl = 'mockDispatchQueueUrl';
    const mockIncomingMessageTableName = 'mockIncomingMessageTableName';
    const mockIncomingMessageTableKey = 'mockIncomingMessageTableKey';
    const mockAnalyticsQueueUrl = 'mockAnalyticsQueueUrl';

    getParameter.mockResolvedValueOnce(mockDispatchQueueUrl);
    getParameter.mockResolvedValueOnce(mockIncomingMessageTableName);
    getParameter.mockResolvedValueOnce(mockIncomingMessageTableKey);
    getParameter.mockResolvedValueOnce(mockAnalyticsQueueUrl);
    publishMessageBatch.mockResolvedValueOnce(undefined);
    updateRecord.mockResolvedValueOnce(undefined);
    publishMessage.mockResolvedValueOnce(undefined);

    vi.mocked(toIMessageRecord).mockReturnValueOnce({
      NotificationID: '1234',
      OneSignalID: 'OneSignal-1234',
      ProcessedDateTime: '1768992347422',
    });

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(getParameter).toHaveBeenCalledTimes(4);
    expect(iocGetQueueService).toHaveBeenNthCalledWith(1, mockDispatchQueueUrl);
    expect(publishMessageBatch).toHaveBeenNthCalledWith(1, [
      {
        ...mockMessageBody,
        OneSignalID: `OneSignal-${mockMessageBody.NotificationID}`,
      },
    ]);
    expect(iocGetDynamoRepository).toHaveBeenCalledWith(mockIncomingMessageTableName, mockIncomingMessageTableKey);
    expect(updateRecord).toHaveBeenCalledWith('1234', {
      NotificationID: '1234',
      OneSignalID: 'OneSignal-1234',
      ProcessedDateTime: '1768992347422',
    });
    expect(iocGetQueueService).toHaveBeenNthCalledWith(2, mockAnalyticsQueueUrl);
    expect(publishMessage).toHaveBeenCalledWith('Test message body.');
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
});
