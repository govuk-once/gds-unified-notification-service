import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { mockIProcessedMessageRecord } from '@common/repositories/interfaces/IMessageRecord';
import { mockAPIEvent, mockEventContext } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { PatchNotification } from '@project/lambdas/flex/http.patchNotification/handler';
import { mockIAnalytics, mockIProcessedMessage } from '@project/lambdas/interfaces';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PatchNotification Handler', () => {
  let instance: PatchNotification;
  let handler: ReturnType<typeof PatchNotification.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Test Fixtures
  const context = mockEventContext('patchNotification');
  const message = mockIProcessedMessage();
  const analyticEvent = mockIAnalytics(NotificationStateEnum.RECEIVED);
  const messageRecord = mockIProcessedMessageRecord(message, {
    DispatchedDateTime: true,
    Events: [analyticEvent],
  });

  const mockPatchNotificationEvent = (status: string) =>
    mockAPIEvent({
      body: {
        Status: status,
      },
      pathParameters: {
        notificationID: messageRecord.NotificationID,
      },
      queryStringParameters: {
        externalUserID: messageRecord.ExternalUserID,
      },
    }) as unknown as EventType;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();

    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(messageRecord);
    serviceMocks.notificationsDynamoRepositoryMock.updateRecord = vi.fn().mockResolvedValue(undefined);
    serviceMocks.analyticsQueueServiceMock.publishMessage.mockResolvedValue(undefined);

    instance = new PatchNotification(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      analytics: Promise.resolve(serviceMocks.analyticsServiceMock),
    }));

    handler = instance.handler();
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
      const event = mockPatchNotificationEvent(enumValue);

      // Act
      const result = await handler(event, context);

      // Assert
      expect(result.statusCode).toEqual(expectedStatusCode);
    }
  );

  it('should call publishEvent to update the notification', async () => {
    // Arrange
    const event = mockPatchNotificationEvent(NotificationStateEnum.READ);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      messageRecord,
      NotificationStateEnum.READ
    );
  });

  it('should log info when updating notification status', async () => {
    // Arrange
    const event = mockPatchNotificationEvent(NotificationStateEnum.READ);

    // Act
    await handler(event, context);

    // Assert
    expect(observabilityMocks.logger.debug).toHaveBeenCalledWith('Successful request - returning 200', {
      notificationID: messageRecord.NotificationID,
      status: 'READ',
    });
  });

  it('should log and return 400 when notificationID is missing', async () => {
    // Arrange
    const event = mockAPIEvent({
      body: {
        Status: 'READ',
      },
      pathParameters: {},
      queryStringParameters: {
        externalUserID: messageRecord.ExternalUserID,
      },
    }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(observabilityMocks.logger.debug).toHaveBeenCalledWith(
      'notificationID has not been provided - returning 400'
    );
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['notificationID has not been provided'],
    });
  });

  it('should return 404 when notifications does not exist', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(null);
    const event = mockPatchNotificationEvent(NotificationStateEnum.READ);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({ Status: 404, HttpError: 'NotFound', Errors: [] });
  });

  it('should return 400 when externalUserID/pushID is undefined', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(messageRecord);
    const event = mockAPIEvent({
      body: {
        Status: 'READ',
      },
      pathParameters: {
        notificationID: messageRecord.NotificationID,
      },
      queryStringParameters: {},
    }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when externalUserID is an empty string', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(messageRecord);
    const event = mockAPIEvent({
      body: {
        Status: 'READ',
      },
      pathParameters: {
        notificationID: messageRecord.NotificationID,
      },
      queryStringParameters: {
        externalUserID: '',
      },
    }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when pushID is an empty string', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(messageRecord);
    const event = mockAPIEvent({
      body: {
        Status: 'READ',
      },
      pathParameters: {
        notificationID: messageRecord.NotificationID,
      },
      queryStringParameters: {
        pushID: '',
      },
    }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
});
