/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ITypedRequestEvent } from '@common/middlewares';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { InboundDynamoRepository } from '@common/repositories';
import {
  AnalyticsQueueService,
  AnalyticsService,
  ConfigurationService,
  ProcessingQueueService,
} from '@common/services';
import { StringParameters } from '@common/utils';
import { PostMessage } from '@project/lambdas/http/postMessage/handler';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Context } from 'aws-lambda';
import { Mocked } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PostMessage Handler', () => {
  let instance: PostMessage;

  // Observability mocks
  const loggerMock = new Logger() as Mocked<Logger>;
  const metricsMock = new Metrics() as Mocked<Metrics>;
  const tracerMock = new Tracer() as Mocked<Tracer>;

  // Service and Repository Mocks
  const configurationServiceMock = new ConfigurationService(
    loggerMock,
    metricsMock,
    tracerMock
  ) as Mocked<ConfigurationService>;
  const processingQueueServiceMock = new ProcessingQueueService(
    configurationServiceMock,
    loggerMock,
    metricsMock,
    tracerMock
  ) as Mocked<ProcessingQueueService>;
  const inboundDynamoRepositoryMock = new InboundDynamoRepository(
    configurationServiceMock,
    loggerMock,
    metricsMock,
    tracerMock
  ) as Mocked<InboundDynamoRepository>;
  const analyticsQueueServiceMock = new AnalyticsQueueService(
    configurationServiceMock,
    loggerMock,
    metricsMock,
    tracerMock
  ) as Mocked<AnalyticsQueueService>;
  const analyticsServiceMock = new AnalyticsService(
    loggerMock,
    metricsMock,
    tracerMock,
    analyticsQueueServiceMock
  ) as Mocked<AnalyticsService>;

  // Mock Message Body
  const mockMessageBody = {
    NotificationID: '1234',
    DepartmentID: 'DEP01',
    UserID: 'UserID',
    MessageTitle: 'You have a new Message',
    MessageBody: 'Open Notification Centre to read your notifications',
    NotificationTitle: 'You have a new Notification',
    NotificationBody: 'Here is the Notification body.',
  };

  // Mock AWS Lambda Context
  const mockContext = {
    functionName: 'postMessage',
    awsRequestId: '12345',
  } as unknown as Context;

  // Mock the QueueEvent (Mapping to your InputType)
  const mockEvent = {
    body: [mockMessageBody],
    headers: {
      'x-api-key': 'mockApiKey',
    },
    requestContext: {
      requestTimeEpoch: 1428582896000,
    },
  } as unknown as ITypedRequestEvent<IMessage[]>;

  const mockUnauthorizedEvent = {
    ...mockEvent,
    headers: {
      'x-api-key': 'mockBadApiKey',
    },
  } as unknown as ITypedRequestEvent<IMessage[]>;

  beforeEach(async () => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    configurationServiceMock.getParameter.mockResolvedValue(`sqsurl/sqsname`);
    await analyticsQueueServiceMock.initialize();

    // Mocking retrieving store apiKey
    instance = new PostMessage(configurationServiceMock, loggerMock, metricsMock, tracerMock, () => ({
      analyticsService: Promise.resolve(analyticsServiceMock),
      inboundTable: Promise.resolve(inboundDynamoRepositoryMock),
      processingQueue: processingQueueServiceMock.initialize(),
    }));

    analyticsServiceMock.publishMultipleEvents.mockResolvedValueOnce(undefined);
    processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
    inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postMessage');
  });

  it('should send messages to processing queue.', async () => {
    // Arrange
    configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
  });

  it('should make a record of inbound messages', async () => {
    // Arrange
    configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(inboundDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      {
        ...mockMessageBody,
        ReceivedDateTime: new Date(mockEvent.requestContext.requestTimeEpoch).toISOString(),
        ValidatedDateTime: date.toISOString(),
      },
    ]);
  });

  it('should send VALIDATED_API_CALL event to analytics queue.', async () => {
    // Arrange
    configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      mockEvent.body,
      ValidationEnum.VALIDATED_API_CALL
    );
  });

  it('should return a status 200 and list of NotificationIDs when call is successful.', async () => {
    // Arrange
    configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(result).toEqual({
      statusCode: 200,
      body: [{ NotificationID: mockEvent.body[0].NotificationID }],
    });
  });

  it('should throw an error when the api call is unauthorized.', async () => {
    // Arrange
    configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await instance.implementation(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result).toEqual({
      statusCode: 401,
      body: {},
    });
  });
});
