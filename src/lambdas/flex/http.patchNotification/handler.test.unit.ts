import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { PatchNotification } from '@project/lambdas/flex/http.patchNotification/handler';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PatchNotification Handler', () => {
  let instance: PatchNotification;
  let handler: ReturnType<typeof PatchNotification.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'patchNotification',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockEvent: EventType;
  let mockUnauthorizedEvent: EventType;
  let mockMissingIdEvent: EventType;

  const notificationID = `efe72235-d02a-45a9-b9d4-a04ff992fcc3`;
  const externalUserID = `abc-cdef-ghi`;

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

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-13T10:00:00Z'));

    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
        'content-type': 'application/json',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      pathParameters: {
        notificationID: mockDbRecord.NotificationID,
      },
      body: JSON.stringify({
        Status: 'READ',
      }),
      queryStringParameters: {
        externalUserID,
      },
    } as unknown as EventType;

    mockMissingIdEvent = {
      ...mockEvent,
      pathParameters: {},
    };

    instance = new PatchNotification(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      analytics: Promise.resolve(serviceMocks.analyticsServiceMock),
    }));

    handler = instance.handler();
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(mockDbRecord);
    serviceMocks.notificationsDynamoRepositoryMock.updateRecord = vi.fn().mockResolvedValue(undefined);
    serviceMocks.analyticsQueueServiceMock.publishMessage.mockResolvedValue(undefined);
    serviceMocks.analyticsQueueServiceMock.addPublishingResultMetric = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('patchNotification');
  });

  it.each([
    ['READ', 202],
    ['MARKED_AS_UNREAD', 202],
    ['read', 202],
    ['marked_as_unread', 202],
    ['invalid-enum', 400],
  ])(
    'should accept valid enums (upper and lowercased) and return 202 - %s, while rejecting any other',
    async (enumValue: string, expectedStatusCode: number) => {
      // Arrange
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

      // Act
      const result = await handler(
        {
          ...mockEvent,
          body: JSON.stringify({
            Status: enumValue,
          }),
        },
        mockContext
      );

      // Assert
      expect(result.statusCode).toEqual(expectedStatusCode);
    }
  );

  it('should call publishEvent to update the notification', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      mockDbRecord,
      NotificationStateEnum.READ
    );
  });

  it('should log info when updating notification status', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.debug).toHaveBeenCalledWith('Successful request - returning 200', {
      notificationID: mockDbRecord.NotificationID,
      status: 'READ',
    });
  });

  it('should log and return 400 when notificationID is missing', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockMissingIdEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.debug).toHaveBeenCalledWith(
      'NotificationID has not been provided - returning 400'
    );
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['NotificationID has not been provided'],
    });
  });

  it('should return 404 when notifications does not exist', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(null);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({ Status: 404, HttpError: 'NotFound', Errors: [] });
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
  it('should return 400 when pushID is an empty string', async () => {
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
});
