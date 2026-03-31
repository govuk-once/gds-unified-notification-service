/* eslint-disable @typescript-eslint/unbound-method */
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { PostMessage } from '@project/lambdas/pso/http.postMessage/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PostMessage Handler', () => {
  let instance: PostMessage;
  let handler: ReturnType<typeof PostMessage.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Mock Message Body
  const mockMessageBody = {
    NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
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

  // Mock the event
  let mockEvent: EventType;
  let mockUnauthorizedEvent: EventType;

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    mockEvent = {
      body: JSON.stringify([mockMessageBody]),
      headers: {
        'x-api-key': 'mockApiKey',
        'Content-Type': `application/json`,
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'Content-Type': `application/json`,
      },
    } as unknown as EventType;

    // Mocking retrieving store apiKey
    instance = new PostMessage(
      serviceMocks.configurationServiceMock,
      observabilityMocks,
      serviceMocks.contentValidationServiceMock,
      () => ({
        analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
        notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
        processingQueue: serviceMocks.processingQueueServiceMock.initialize(),
      })
    );
    handler = instance.handler();

    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);
    serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch.mockResolvedValue(undefined);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postMessage');
  });

  it('should send messages to processing queue.', async () => {
    // Act
    const result = await handler(mockEvent, mockContext);
    console.log(result);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
  });

  it('should make a record of notifications messages', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler({ ...mockEvent }, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      {
        ...mockMessageBody,
        APIGWExtendedID: mockEvent.requestContext.requestId,
        ReceivedDateTime: new Date(mockEvent.requestContext.requestTimeEpoch).toISOString(),
        ValidatedDateTime: date.toISOString(),
        Events: [],
      },
    ]);
  });

  it('should send VALIDATED_API_CALL event to analytics queue.', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [{ ...mockMessageBody, APIGWExtendedID: mockEvent.requestContext.requestId }],
      NotificationStateEnum.VALIDATED_API_CALL
    );
  });

  it('should return a status 202 and list of NotificationIDs when call is successful.', async () => {
    // Act
    const result = await handler({ ...mockEvent }, mockContext);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([{ NotificationID: mockMessageBody.NotificationID }]);
  });

  it('should NOT throw an error when called with a message containing deeplink that is on the allowlist', async () => {
    // Act
    const result = await handler(
      {
        ...mockEvent,
        body: JSON.stringify([{ ...mockMessageBody, MessageBody: 'https://readme.gov.uk/hello-world?q=1' }]),
      },
      mockContext
    );

    // Assert
    expect(result.statusCode).toEqual(202);
  });
  it('should throw an error when called with a message containing deeplink that is not on the allowlist', async () => {
    // Act
    const result = await handler(
      { ...mockEvent, body: JSON.stringify([{ ...mockMessageBody, MessageBody: 'https://bitcoin.com' }]) },
      mockContext
    );

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(result.body).toEqual(`Bad request: 

 https://bitcoin.com is using bitcoin.com hostname which is not on the allow list.`);
  });
});
