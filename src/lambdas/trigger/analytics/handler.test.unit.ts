/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { QueueEvent } from '@common/operations';
import { ConfigurationService } from '@common/services';
import { Analytics } from '@project/lambdas/trigger/analytics/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/ioc', () => ({
  iocGetConfigurationService: vi.fn(),
  iocGetQueueService: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));

describe('Analytics QueueHandler', () => {
  let instance: Analytics;
  let configurationServiceMock: ConfigurationService;

  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  let mockContext: Context;
  let mockEvent: QueueEvent<string>;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    configurationServiceMock = vi.mocked(new ConfigurationService(loggerMock, metricsMock, tracerMock));
    instance = new Analytics(configurationServiceMock, loggerMock, metricsMock, tracerMock);

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'analytics',
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
          messageAttributes: {
            Title: {
              dataType: 'String',
              stringValue: 'From dispatch lambda',
            },
          },
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

  it('should fetch the dynamo table name from configurator', async () => {
    // Arrange
    configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce('mockEventsTableName');

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(configurationServiceMock.getParameter).toHaveBeenCalledTimes(1);
  });
});
