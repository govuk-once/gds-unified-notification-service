/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetAnalyticsQueueService, iocGetDispatchQueueService, iocGetInboundDynamoRepository } from '@common/ioc';
import { QueueEvent } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories/inboundDynamoRepository';
import { ConfigurationService, NotificationService } from '@common/services';
import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import { Dispatch } from '@project/lambdas/trigger/dispatch/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/ioc', { spy: true });

describe('Dispatch QueueHandler', () => {
  let instance: Dispatch;

  // Observability mocks
  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  // Config shims
  const getParameter = vi.fn();
  const mockConfigurationService = { getParameter } as unknown as ConfigurationService;
  const publishMessage = vi.fn();
  const notificationServiceMock = vi.fn();

  const mockAnalyticsQueue = {
    publishMessage: publishMessage,
  } as unknown as AnalyticsQueueService;

  const mockDynamo = {} as unknown as InboundDynamoRepository;

  let mockContext: Context;
  let mockEvent: QueueEvent<IProcessedMessage>;

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    instance = new Dispatch(mockConfigurationService, loggerMock, metricsMock, tracerMock, {
      initialize: notificationServiceMock,
      send: notificationServiceMock,
    } as unknown as NotificationService);

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
          body: {
            NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
            UserID: 'damianp_apadmi_dev_build_01',
            ExternalUserID: 'test',
            DepartmentID: 'Dev',
            NotificationTitle: 'Boom',
            NotificationBody: 'psst',
          },
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
    const mockAnalyticsQueueUrl = 'mockAnalyticsQueueUrl';
    const mockDynamodbTableName = 'mockDynamodbTableName';
    getParameter.mockResolvedValueOnce(mockDynamodbTableName).mockResolvedValueOnce(mockAnalyticsQueueUrl);
    publishMessage.mockResolvedValueOnce(undefined);
    notificationServiceMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ requestId: '123', success: true });

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(iocGetAnalyticsQueueService).toHaveBeenCalled();
    expect(publishMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        NotificationID: mockEvent.Records[0].body.NotificationID,
        DepartmentID: mockEvent.Records[0].body.DepartmentID,
        Event: 'SUCCESS',
      })
    );
  });

  it('should set queue url to an empty string if not set and get an error from queue service.', async () => {
    // Arrange
    const error = new Error('SQS Publish Error: Queue Url Does not Exist');

    vi.mocked(iocGetAnalyticsQueueService).mockImplementationOnce(() => {
      throw error;
    });
    getParameter.mockResolvedValueOnce(undefined);
    notificationServiceMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ requestId: '123', success: true });

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(loggerMock.error).toHaveBeenCalledWith(
      `Unexpected error`,
      expect.objectContaining({ error: expect.any(Object) })
    );
    expect(iocGetAnalyticsQueueService).toHaveBeenCalled();
  });
});
