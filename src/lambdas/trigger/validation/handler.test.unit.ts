import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetQueueService } from '@common/ioc';
import { QueueEvent } from '@common/operations';
import { Configuration, QueueService } from '@common/services';
import { IMessage } from '@project/lambdas/interfaces/ITriggerValidation';
import { Validation } from '@project/lambdas/trigger/validation/handler';
import { Context } from 'aws-lambda';

vi.mock('@common/ioc', () => ({
  iocGetConfigurationService: vi.fn(),
  iocGetQueueService: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));

describe('Validation QueueHandler', () => {
  const getParameter = vi.fn();
  const publishMessage = vi.fn();
  const publishMessageBatch = vi.fn();
  const info = vi.fn();

  const instance: Validation = new Validation(
    { getParameter } as unknown as Configuration,
    { info } as unknown as Logger,
    {} as unknown as Metrics,
    {} as unknown as Tracer
  );
  const mockQueue = {
    publishMessageBatch: publishMessageBatch,
    publishMessage: publishMessage,
  } as unknown as QueueService;

  let mockContext: Context;
  let mockEvent: QueueEvent<IMessage>;

  beforeEach(() => {
    vi.mocked(iocGetQueueService).mockReturnValue(mockQueue);

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'validation',
      awsRequestId: '12345',
    } as unknown as Context;

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
          body: {
            NotificationID: '1234',
            DepartmentID: 'DVLA01',
            UserID: 'UserID',
            MessageTitle: 'You have a new Message',
            MessageBody: 'Open Notification Centre to read your notifications',
            MessageTitleFull: 'You have a new medical driving license',
            MessageBodyFull: 'The DVLA has issued you a new license.',
          },
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
    const mockAnalyticsQueueUrl = 'mockAnalyticsQueueUrl';

    getParameter.mockResolvedValueOnce(mockProcessingQueueUrl);
    getParameter.mockResolvedValueOnce(mockAnalyticsQueueUrl);
    publishMessageBatch.mockResolvedValueOnce(undefined);
    publishMessageBatch.mockResolvedValueOnce(undefined);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(getParameter).toHaveBeenCalledTimes(2);
    expect(iocGetQueueService).toHaveBeenNthCalledWith(1, mockProcessingQueueUrl);
    expect(iocGetQueueService).toHaveBeenNthCalledWith(2, mockAnalyticsQueueUrl);
    expect(publishMessageBatch).toHaveBeenCalledWith([
      [
        {},
        JSON.stringify({
          NotificationID: '1234',
          DepartmentID: 'DVLA01',
          UserID: 'UserID',
          MessageTitle: 'You have a new Message',
          MessageBody: 'Open Notification Centre to read your notifications',
          MessageTitleFull: 'You have a new medical driving license',
          MessageBodyFull: 'The DVLA has issued you a new license.',
        }),
      ],
    ]);
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
});
