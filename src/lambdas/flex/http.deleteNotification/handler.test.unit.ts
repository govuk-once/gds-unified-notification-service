import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { DeleteNotification } from '@project/lambdas/flex/http.deleteNotification/handler';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('DeleteNotification Handler', () => {
  let instance: DeleteNotification;
  let handler: ReturnType<typeof DeleteNotification.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'deleteNotification',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockUnauthorizedEvent: EventType;
  let mockInternalServerError: EventType;
  let mockEvent: EventType;
  let mockMissingIdEvent: EventType;

  const mockDbRecord: IMessageRecord = {
    NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
    MessageTitle: 'You have a new Message',
    MessageBody: 'Open Notification Centre to read your notifications',
    NotificationTitle: 'You have a new Notification',
    NotificationBody: 'Here is the Notification body.',
    Events: [
      {
        EventID: '00000000-0000-0000-0000-a04ff992fcc3',
        NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
        DepartmentID: 'abc',
        Event: NotificationStateEnum.RECEIVED,
        EventDateTime: new Date().toISOString(),
        EventReason: '',
        APIGWExtendedID: 'Test',
      },
    ],
    DispatchedDateTime: '2026-02-13',
  } as IMessageRecord;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      pathParameters: {
        notificationID: '12345',
      },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockBadApiKey',
      },
    } as unknown as EventType;

    mockMissingIdEvent = {
      ...mockEvent,
      pathParameters: {},
    } as unknown as EventType;

    mockInternalServerError = null as unknown as EventType;

    instance = new DeleteNotification(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
    }));

    handler = instance.handler();
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('deleteNotification');
  });

  it('should return 204 with status ok and return a notification', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(204);
  });

  it('should call publish event with the NotificationStateEnum.hidden', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert

    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      mockDbRecord,
      NotificationStateEnum.HIDDEN
    );
  });

  it('should handle errors when calling API key with status internal server error', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockInternalServerError, mockContext);

    // Assert
    expect(result.statusCode).toEqual(500);
  });

  it('return internal server error when config servers throws an error', async () => {
    // Arrange
    const error = new Error('Config Service Error');
    serviceMocks.configurationServiceMock.getParameter.mockRejectedValueOnce(error);

    // Act
    const result = await handler(mockInternalServerError, mockContext);

    // Assert
    expect(result.statusCode).toEqual(500);
  });

  it('should return 401 with status unauthorized when invalid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
  });
});
