import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetInboundDynamoRepository, iocGetAnalyticsQueueService } from '@common/ioc';
import { QueueEvent } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories/dynamodbRepository';
import { AnalyticsQueueService } from '@common/services';
import { Dispatch } from '@project/lambdas/trigger/dispatch/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/ioc', () => ({
  iocGetInboundDynamoRepository: vi.fn(),
  iocGetAnalyticsQueueService: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));

describe('Dispatch QueueHandler', () => {
  let instance: Dispatch;

  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  const publishMessageBatch = vi.fn();
  const publishMessage = vi.fn();

  const mockAnalyticsQueue = {
    publishMessageBatch: publishMessageBatch,
    publishMessage: publishMessage,
  } as unknown as AnalyticsQueueService;

  const mockDynamo = {} as unknown as InboundDynamoRepository;

  let mockContext: Context;
  let mockEvent: QueueEvent<string>;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    instance = new Dispatch(loggerMock, metricsMock, tracerMock);

    vi.mocked(iocGetInboundDynamoRepository).mockResolvedValue(mockDynamo);
    vi.mocked(iocGetAnalyticsQueueService).mockResolvedValue(mockAnalyticsQueue);

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'dispatch',
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
    expect(instance.operationId).toBe('dispatch');
  });

  it('should log send a message to the analytics queue when the lambda is triggered', async () => {
    // Arrange
    publishMessage.mockResolvedValueOnce(undefined);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(iocGetAnalyticsQueueService).toHaveBeenCalled();
    expect(publishMessage).toHaveBeenCalledWith('Test message body.');
  });
});
