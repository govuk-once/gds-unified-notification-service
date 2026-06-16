import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetFlexNotificationById } from '@project/lambdas/flex/http.getNotificationById/handler';
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { IOrganisationRecord } from '@project/lambdas/interfaces/IOrganisationRecord';
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

  let mockEvent: EventType;
  let mockUnauthorizedEvent: EventType;
  let mockInternalServerError: EventType;

  const mockContext = {
    functionName: 'getFlexNotificationById',
    awsRequestId: '12345',
  } as unknown as Context;

  const notificationID = `efe72235-d02a-45a9-b9d4-a04ff992fcc3`;
  const externalUserID = `abc-cdef-ghi`;
  const organisationID = 'ORG01';
  const displayName = 'ORG';

  const mockDbRecord: IMessageRecord = {
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

  const mockResponse: IFlexNotification = {
    DispatchedDateTime: '2026-02-13',
    MessageBody: 'Open Notification Centre to read your notifications',
    MessageTitle: 'You have a new Message',
    NotificationBody: 'Here is the Notification body.',
    NotificationID: notificationID,
    NotificationTitle: 'You have a new Notification',
    Status: NotificationStateEnum.RECEIVED,
    Metadata: {
      Sender: {
        DisplayName: displayName,
      },
    },
  };

  const mockOrganisationRecord: IOrganisationRecord = {
    OrganisationID: organisationID,
    DisplayName: displayName,
  };

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

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockBadApiKey',
      },
      queryStringParameters: {
        externalUserID: externalUserID,
      },
    };

    mockInternalServerError = null as unknown as EventType;

    instance = new GetFlexNotificationById(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      organisationsDynamoRepository: Promise.resolve(serviceMocks.organisationsDynamoRepositoryMock),
    }));

    handler = instance.handler();

    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    serviceMocks.organisationsDynamoRepositoryMock.getOrganisations.mockResolvedValue([mockOrganisationRecord]);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotificationById');
  });

  it('should return 200 with status ok when valid API key is provided', async () => {
    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Successful request - returning 200', {
      notificationID: mockDbRecord.NotificationID,
    });
  });

  it('should return 200 with status ok and return a notification', async () => {
    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual(mockResponse);
  });

  it('should return 200 with status ok and return a notification - using pushID query parameter', async () => {
    // Arrange
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
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.getRecord).toHaveBeenCalledWith(
      mockEvent.pathParameters.notificationID
    );
  });

  it('should fetch API key from config service', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith('api/flex/apiKey');
  });

  it('should handle errors when calling API key with status internal server error', async () => {
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
    // Act
    const result = await handler(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
  });

  it('should return 404 for expired notification notification from getRecord call', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue({
      ...mockDbRecord,
      ExpirationDateTime: new Date(0).toISOString(),
    });

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
  });

  it('should return 404 where the organisation DisplayName was not retrieved from dynamoDB and log the issue', async () => {
    // Arrange
    serviceMocks.organisationsDynamoRepositoryMock.getOrganisations.mockResolvedValueOnce([]);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
      'No organisation matches the DepartmentID in the notification.',
      { OrganisationID: mockDbRecord.OrganisationID }
    );
  });

  it('should return 400 when externalUserID/pushID is undefined', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {};

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when pushId is an empty string', async () => {
    // Arrange
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
