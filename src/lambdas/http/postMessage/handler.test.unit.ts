/* eslint-disable @typescript-eslint/unbound-method */

import { ITypedRequestEvent } from '@common/middlewares';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { injectObservabilityMocks, injectServiceMocks } from '@common/utils/testServices';
import { PostMessage } from '@project/lambdas/http/postMessage/handler';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PostMessage Handler', () => {
  let instance: PostMessage;

  const observabilityMocks = injectObservabilityMocks();
  const serviceMocks = injectServiceMocks(observabilityMocks);

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
      requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    },
  } as unknown as ITypedRequestEvent<IMessage[]>;

  const mockUnauthorizedEvent = {
    ...mockEvent,
    headers: {
      'x-api-key': 'mockBadApiKey',
    },
  } as unknown as ITypedRequestEvent<IMessage[]>;

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue(`sqsurl/sqsname`);

    // Mocking retrieving store apiKey
    instance = new PostMessage(
      serviceMocks.configurationServiceMock,
      observabilityMocks.loggerMock,
      observabilityMocks.metricsMock,
      observabilityMocks.tracerMock,
      () => ({
        analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
        inboundTable: Promise.resolve(serviceMocks.inboundDynamoRepositoryMock),
        processingQueue: serviceMocks.processingQueueServiceMock.initialize(),
      })
    );

    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValueOnce(undefined);
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValueOnce(undefined);
    serviceMocks.inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce(undefined);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postMessage');
  });

  it('should send messages to processing queue.', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
  });

  it('should make a record of inbound messages', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.inboundDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      {
        ...mockMessageBody,
        APIGWExtendedID: mockEvent.requestContext.requestId,
        ReceivedDateTime: new Date(mockEvent.requestContext.requestTimeEpoch).toISOString(),
        ValidatedDateTime: date.toISOString(),
      },
    ]);
  });

  it('should send VALIDATED_API_CALL event to analytics queue.', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [{ ...mockEvent.body[0], APIGWExtendedID: mockEvent.requestContext.requestId }],
      ValidationEnum.VALIDATED_API_CALL
    );
  });

  it('should return a status 202 and list of NotificationIDs when call is successful.', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(result).toEqual({
      statusCode: 202,
      body: [{ NotificationID: mockEvent.body[0].NotificationID }],
    });
  });

  it('should throw an error when the api call is unauthorized.', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await instance.implementation(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result).toEqual({
      statusCode: 401,
      body: {},
    });
  });
});
