import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetFlexNotificationById } from '@project/lambdas/flex/http.getNotificationById/handler';
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetNotificationById Handler', () => {
  let instance: GetFlexNotificationById;
  let handler: ReturnType<typeof GetFlexNotificationById.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'getFlexNotificationById',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockInternalServerError: EventType;
  let mockEvent: EventType;

  let mockDbRecord: IMessageRecord;
  let mockResponse: IFlexNotification;
  const notificationID = `efe72235-d02a-45a9-b9d4-a04ff992fcc3`;
  const externalUserID = `abc-cdef-ghi`;

  beforeEach(() => {
    vi.resetAllMocks();
    //
    // Mock events
    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      pathParameters: {
        notificationID: notificationID,
      },
      queryStringParameters: {
        externalUserID: externalUserID,
      },
    } as unknown as EventType;

    mockInternalServerError = null as unknown as EventType;

    // Reset db object
    mockDbRecord = {
      NotificationID: notificationID,
      DepartmentID: 'DEP01',
      UserID: 'UserID',
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new Notification',
      NotificationBody: 'Here is the Notification body.',
      ExternalUserID: externalUserID,
      OrganisationID: 'ORG01',
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

    // Reset expected response
    mockResponse = {
      DispatchedDateTime: '2026-02-13',
      MessageBody: 'Open Notification Centre to read your notifications',
      MessageTitle: 'You have a new Message',
      NotificationBody: 'Here is the Notification body.',
      NotificationID: notificationID,
      NotificationTitle: 'You have a new Notification',
      Status: NotificationStateEnum.RECEIVED,
    };

    instance = new GetFlexNotificationById(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
    }));

    handler = instance.handler();

    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotificationById');
  });

  it('should return 200 with status ok when valid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Successful request - returning 200', {
      notificationID: mockDbRecord.NotificationID,
    });
  });

  it('should return 200 with status ok and return a notification', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual(mockResponse);
  });

  it('should return 200 with status ok and return a notification - using pushID query parameter', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    mockEvent.queryStringParameters = {
      pushID: mockEvent.queryStringParameters.externalUserID,
    };

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual(mockResponse);
  });

  it('should get notification from getRecord call', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.getRecord).toHaveBeenCalledWith(
      mockEvent.pathParameters.notificationID
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

  it('should return 404 for expired notification notification from getRecord call', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue({
      ...mockDbRecord,
      ExpirationDateTime: new Date(0).toISOString(),
    });

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
  });

  it('should return 400 when externalUserID/pushID is undefined', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {};

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when pushId is an empty string', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {
      pushID: '',
    };

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
  it('should return 400 when externalUserID is an empty string', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {
      externalUserID: '',
    };

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
});
