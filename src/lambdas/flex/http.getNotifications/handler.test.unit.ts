import { NotificationDispatchedStateEnum } from '@common/models/NotificationStateEnum';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetNotifications } from '@project/lambdas/flex/http.getNotifications/handler';
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('getNotifications Handler', () => {
  let instance: GetNotifications;
  let handler: ReturnType<typeof GetNotifications.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'getNotifications',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockAuthorizedEvent: EventType;
  let mockUnauthorizedEvent: EventType;
  let mockInternalServerError: EventType;
  let mockEvent: EventType;

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
        Event: NotificationDispatchedStateEnum.RECEIVED,
        EventDateTime: new Date().toISOString(),
        EventReason: '',
        APIGWExtendedID: 'Test',
      },
    ],
    DispatchedDateTime: '2026-02-13',
  } as IMessageRecord;

  const mockResponse: IFlexNotification = {
    DispatchedDateTime: '2026-02-13',
    MessageBody: 'Open Notification Centre to read your notifications',
    MessageTitle: 'You have a new Message',
    NotificationBody: 'Here is the Notification body.',
    NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
    NotificationTitle: 'You have a new Notification',
    Status: NotificationDispatchedStateEnum.RECEIVED,
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      queryStringParameters: {
        externalUserID: 'user-ABC',
      },
    } as unknown as EventType;

    mockAuthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockApiKey',
      },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockBadApiKey',
      },
    } as unknown as EventType;

    mockInternalServerError = null as unknown as EventType;

    instance = new GetNotifications(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
    }));

    handler = instance.handler();

    serviceMocks.notificationsDynamoRepositoryMock.getRecords.mockResolvedValue([mockDbRecord]);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotifications');
  });

  it('should return 200 with status ok and return a notification', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockAuthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([mockResponse]);
  });

  it('should fetch all notifications from getRecords call', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockAuthorizedEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.getRecords).toHaveBeenCalledWith({
      field: 'ExternalUserID',
      value: 'user-ABC',
    });
  });

  it('should exclude all notifications with expiry date in the pastfrom getRecords call', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    serviceMocks.notificationsDynamoRepositoryMock.getRecords.mockResolvedValue([
      {
        ...mockDbRecord,
        ExpirationDateTime: new Date(0).toISOString(), // 1970
      },
    ]);

    // Act
    const { body, statusCode } = await handler(mockAuthorizedEvent, mockContext);
    const results = JSON.parse(body) as [];

    // Assert
    expect(statusCode).toEqual(200);
    expect(results.length).toEqual(0);
  });

  it('should return an empty array when there are no notifications', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecords = vi.fn().mockResolvedValue([]);

    // Act
    const result = await handler(mockAuthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should return 401 with status unauthorized when invalid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
  });

  it('should fetch API key from config service', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockAuthorizedEvent, mockContext);

    // Assert
    expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith('api/flex/apiKey');
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

  it('should exclude notifications with HIDDEN status', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    serviceMocks.notificationsDynamoRepositoryMock.getRecords.mockResolvedValue([
      {
        ...mockDbRecord,
        Events: [
          {
            EventID: '00000000-0000-0000-0000-a04ff992fcc3',
            NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
            DepartmentID: 'abc',
            Event: NotificationDispatchedStateEnum.RECEIVED,
            EventDateTime: new Date().toISOString(),
            EventReason: '',
            APIGWExtendedID: 'Test',
          },
          {
            EventID: '00000000-0000-0000-0000-a04ff992fcc3',
            NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
            DepartmentID: 'abc',
            Event: NotificationDispatchedStateEnum.HIDDEN,
            EventDateTime: new Date().toISOString(),
            EventReason: '',
            APIGWExtendedID: 'Test',
          },
        ],
      },
    ]);

    // Act
    const { body, statusCode } = await handler(mockAuthorizedEvent, mockContext);
    const result = JSON.parse(body) as [];

    // Assert
    expect(statusCode).toEqual(200);
  });
});
