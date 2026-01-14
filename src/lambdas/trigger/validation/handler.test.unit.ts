import { QueueEvent } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { QueueService } from '@common/services/queueService';
import { Validation } from '@project/lambdas/trigger/validation/handler';
import { Context } from 'aws-lambda';

vi.mock('@common/services/queueService');
vi.mock('@common/services/configuration');

describe('Validation QueueHandler', () => {
  let instance: Validation = new Validation();
  let mockContext: Context;
  let mockEvent: QueueEvent<string>;

  beforeEach(() => {
    instance = new Validation();

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
          body: 'mockBody',
        },
      ],
    };
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('validation');
  });

  it('should log send a message to valid message queue when implementation is called', async () => {
    // Arrange
    vi.spyOn(Configuration.prototype, 'getParameter').mockResolvedValue('mockUrl');
    const mockPublish = vi.spyOn(QueueService.prototype, 'publishMessage').mockResolvedValue(undefined);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(mockPublish).toHaveBeenCalledWith(
      {
        Title: {
          DataType: 'String',
          StringValue: 'Test Message',
        },
      },
      'Test message body.'
    );
  });
});
