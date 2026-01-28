/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ITypedRequestEvent } from '@common/middlewares';
import { InboundDynamoRepository } from '@common/repositories';
import { AnalyticsQueueService, ConfigurationService, ProcessingQueueService } from '@common/services';
import { StringParameters } from '@common/utils';
import { PostMessage } from '@project/lambdas/http/postMessage/handler';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Context } from 'aws-lambda';
import { Mocked } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/processingQueueService', { spy: true });
vi.mock('@common/services/analyticsQueueService', { spy: true });
vi.mock('@common/repositories/inboundDynamoRepository', { spy: true });

describe('PostMessage Handler', () => {
  let instance: PostMessage;
  let mockContext: Context;
  let mockEvent: ITypedRequestEvent<IMessage[]>;
  let mockMessageBody: IMessage;

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
  configurationServiceMock.getParameter.mockResolvedValue('some-mocked-value');
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

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();

    instance = new PostMessage(configurationServiceMock, loggerMock, metricsMock, tracerMock, () => ({
      analyticsService: Promise.resolve(analyticsQueueServiceMock),
      inboundTable: Promise.resolve(inboundDynamoRepositoryMock),
      processingQueue: Promise.resolve(processingQueueServiceMock),
    }));

    // Mock Message Body
    mockMessageBody = {
      NotificationID: '1234',
      DepartmentID: 'DEP01',
      UserID: 'UserID',
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new Notification',
      NotificationBody: 'Here is the Notification body.',
    };

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'postMessage',
      awsRequestId: '12345',
    } as unknown as Context;

    // Mock the QueueEvent (Mapping to your InputType)
    mockEvent = {
      body: [mockMessageBody],
      requestContext: {
        identity: {
          apiKey: 'mockApiKey',
        },
        requestTimeEpoch: 1428582896000,
      },
    } as unknown as ITypedRequestEvent<IMessage[]>;

    // Mocking retrieving store apiKey
    // eslint-disable-next-line @typescript-eslint/require-await
    configurationServiceMock.getParameter.mockImplementation(async (parameterName) => {
      if (parameterName === StringParameters.Api.PostMessage.ApiKey) {
        return 'mockApiKey';
      }
      return 'some-mocked-value';
    });
  });

  it('should log "Received request" when implementation is called', async () => {
    // Arrange
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(loggerMock.info).toHaveBeenCalledWith('Received request');
  });

  it('should send a message to processing queue and return then validated messages NotificationID.', async () => {
    // Arrange
    processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
    inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
    analyticsQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);

    // Act
    const result = await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
    expect(inboundDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: new Date(mockEvent.requestContext.requestTimeEpoch),
        ValidatedDateTime: expect.any(Date),
      }),
    ]);
    expect(result).toEqual({
      body: [
        {
          NotificationID: mockMessageBody.NotificationID,
        },
      ],
      statusCode: 200,
    });
    //expect(analyticsQueueServiceMock.publishMessage).toHaveBeenCalledWith('Test message body.');
  });

  it('should handle when a message is not parsed, make a record of both validated and failed messages, and return then validated messages NotificationID.', async () => {
    // Arrange
    processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
    inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
    inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
    analyticsQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);

    const mockPartialFailedEvent = {
      ...mockEvent,
      body: [
        {
          NotificationID: '1231',
          UserID: 'UserID',
        },
        mockMessageBody,
      ],
    } as unknown as ITypedRequestEvent<IMessage[]>;

    // Act
    const result = await instance.implementation(mockPartialFailedEvent, mockContext);

    // Assert
    expect(processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
    expect(inboundDynamoRepositoryMock.createRecordBatch).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: new Date(mockEvent.requestContext.requestTimeEpoch),
        ValidatedDateTime: expect.any(Date),
      }),
    ]);
    expect(inboundDynamoRepositoryMock.createRecordBatch).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        NotificationID: '1231',
        ReceivedDateTime: new Date(mockEvent.requestContext.requestTimeEpoch),
        UserID: 'UserID',
      }),
    ]);
    expect(result).toEqual({
      body: [
        {
          NotificationID: mockMessageBody.NotificationID,
        },
      ],
      statusCode: 200,
    });
    //expect(analyticsQueueServiceMock.publishMessage).toHaveBeenCalledWith('Test message body.');
  });

  it('should handle when a message is not parsed, make a record of failed messages and then return an empty list.', async () => {
    // Arrange
    inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
    analyticsQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);

    const mockParitalFailedEvent = {
      ...mockEvent,
      body: [
        {
          NotificationID: '1231',
          UserID: 'UserID',
        },
        {
          NotificationID: '1232',
          UserID: 'UserID-1',
        },
      ],
    } as unknown as ITypedRequestEvent<IMessage[]>;

    // Act
    const result = await instance.implementation(mockParitalFailedEvent, mockContext);

    // Assert
    expect(processingQueueServiceMock.publishMessageBatch).not.toHaveBeenCalled();
    expect(inboundDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        NotificationID: '1231',
        ReceivedDateTime: new Date(mockEvent.requestContext.requestTimeEpoch),
        UserID: 'UserID',
      }),
      expect.objectContaining({
        NotificationID: '1232',
        ReceivedDateTime: new Date(mockEvent.requestContext.requestTimeEpoch),
        UserID: 'UserID-1',
      }),
    ]);
    expect(result).toEqual({ body: [], statusCode: 200 });
    //expect(analyticsQueueServiceMock.publishMessage).toHaveBeenCalledWith('Test message body.');
  });

  it('should handle when a message is not parse and has not notification id, returning an empty list.', async () => {
    // Arrange
    analyticsQueueServiceMock.publishMessage.mockResolvedValueOnce(undefined);

    const mockFailedEvent = {
      ...mockEvent,
      body: [
        {
          UserID: 'UserID-1',
        },
      ],
    } as unknown as ITypedRequestEvent<IMessage[]>;

    // Act
    const result = await instance.implementation(mockFailedEvent, mockContext);

    // Assert
    expect(loggerMock.error).toBeCalledWith('Failed to build MessageRecord, no NotificationID was provided.');
    expect(processingQueueServiceMock.publishMessageBatch).not.toBeCalled();
    expect(inboundDynamoRepositoryMock.createRecordBatch).not.toBeCalled();
    expect(result).toEqual({ body: [], statusCode: 200 });
  });
});
