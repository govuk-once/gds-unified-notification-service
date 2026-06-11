import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
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
  let mockBadRequestEvent: EventType;
  let mockEvent: EventType;
  let mockMissingIdEvent: EventType;

  const notificationID = `efe72235-d02a-45a9-b9d4-a04ff992fcc3`;
  const externalUserID = `abc-cdef-ghi`;

  const mockDbRecord: IMessageRecord = {
    NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
    DepartmentID: 'DEP01',
    UserID: 'UserID',
    ExternalUserID: externalUserID,
    MessageTitle: 'You have a new Message',
    MessageBody: 'Open Notification Centre to read your notifications',
    NotificationTitle: 'You have a new Notification',
    NotificationBody: 'Here is the Notification body.',
    Events: [
      {
        EventID: '00000000-0000-0000-0000-a04ff992fcc3',
        NotificationID: notificationID,
        DepartmentID: 'abc',
        Event: NotificationStateEnum.RECEIVED,
        EventDateTime: new Date().toISOString(),
        EventReason: '',
        APIGWExtendedID: 'Test',
      },
    ],
    DispatchedDateTime: '2026-02-13',
  };

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
      queryStringParameters: {
        externalUserID,
      },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockBadApiKey',
      },
    };

    mockMissingIdEvent = {
      ...mockEvent,
      pathParameters: {},
    };

    mockBadRequestEvent = {
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      pathParameters: {
        notificationID: '12345',
      },
      headers: {},
    } as unknown as EventType;

    instance = new DeleteNotification(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
    }));

    handler = instance.handler();
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue(`mockApiKey`);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('deleteNotification');
  });

  it('should return 204 with status ok and return a notification', async () => {
    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(204);
  });

  it('should call publish event with the NotificationStateEnum.hidden', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      mockDbRecord,
      NotificationStateEnum.HIDDEN
    );
  });

  it('should return 400 when notificationID is missing from path params', async () => {
    // Act
    const result = await handler(mockMissingIdEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['NotificationID has not been provided'],
    });
  });

  it('should return 400 when externalUserID/pushID is undefined', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {};

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['PushID has not been provided'],
    });
  });

  it('should return 400 when externalUserID is an empty string', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {
      externalUserID: '',
    };

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['PushID has not been provided'],
    });
  });

  it('should return 400 when pushID is an empty string', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {
      pushID: '',
    };

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['PushID has not been provided'],
    });
  });

  it('should return 404 when notification is not returned from DynamoDB', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValueOnce(null);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({
      Status: 404,
      HttpError: 'NotFound',
      Errors: [],
    });
  });

  it('should return 404 when externalUserId of the notification does not match the externalUserId provided', async () => {
    // Arrange
    const mockDbRecordUnauthorized = { ...mockDbRecord, ExternalUserID: 'invalid' };
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValueOnce(mockDbRecordUnauthorized);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({
      Status: 404,
      HttpError: 'NotFound',
      Errors: [],
    });
  });

  it('should handle errors when calling API key is not found in the request header', async () => {
    // Act
    const result = await handler(mockBadRequestEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
    expect(JSON.parse(result.body)).toEqual({ Status: 401, HttpError: 'Unauthorized', Errors: [] });
  });

  it('should return 401 with status unauthorized when invalid API key is provided', async () => {
    // Act
    const result = await handler(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
    expect(JSON.parse(result.body)).toEqual({ Status: 401, HttpError: 'Unauthorized', Errors: [] });
  });

  it('return internal server error when config servers throws an error', async () => {
    // Arrange
    const error = new ServiceMisconfigurationError();
    serviceMocks.configurationServiceMock.getParameter.mockRejectedValueOnce(error);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(500);
    expect(JSON.parse(result.body)).toEqual({ Status: 500, HttpError: 'InternalServerError', Errors: [] });
  });
});
