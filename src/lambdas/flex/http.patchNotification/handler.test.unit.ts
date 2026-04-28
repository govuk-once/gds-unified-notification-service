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
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockBadApiKey',
        'content-type': 'application/json',
      },
    } as unknown as EventType;

    mockMissingIdEvent = {
      ...mockEvent,
      pathParameters: {},
    } as unknown as EventType;

    instance = new PatchNotification(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      analytics: Promise.resolve(serviceMocks.analyticsServiceMock),
    }));

    handler = instance.handler();
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(mockDbRecord);
    serviceMocks.notificationsDynamoRepositoryMock.updateRecord = vi.fn().mockResolvedValue(undefined);
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
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Successful request', {
      notificationID: mockDbRecord.NotificationID,
      status: 'READ',
    });
  });

  it('should return 401 with status unauthorized when invalid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
  });

  it('should log error when notificationID is missing', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockMissingIdEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Notification Id has not been provided.');
  });

  it('should return 401 with status unauthorized and should return', async () => {
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
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith('api/flex/apiKey');
  });

  it('should return 404 when notifications does not exist', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(null);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
  });
});
