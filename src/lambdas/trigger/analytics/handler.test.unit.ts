import { QueueEvent } from '@common/operations';
import { Analytics } from '@project/lambdas/trigger/analytics/handler';
import { Context } from 'aws-lambda';

vi.mock('@common/services/queueService');
vi.mock('@common/services/configuration');

describe('Management QueueHandler', () => {
  let instance: Analytics = new Analytics();
  let mockContext: Context;
  let mockEvent: QueueEvent<string>;

  beforeEach(() => {
    instance = new Analytics();

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
    expect(instance.operationId).toBe('analytics');
  });
});
