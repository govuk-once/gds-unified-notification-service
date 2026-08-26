import { NotificationStateEnum } from '@common/models';
import { mockIMessageRecord } from '@common/repositories';
import { DeleteNotification } from '@project/lambdas/flex/http.deleteNotification/handler';
import { iocSpies, mockEventContext, mockFlexAPIEvent, mockIMessage, mockServicesExpectedBehaviour } from '@test/mocks';
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

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Test Fixtures
  let context: Context;
  let event: EventType;

  const notificationID = `efe72235-d02a-45a9-b9d4-a04ff992fcc3`;
  const externalUserID = `abc-cdef-ghi`;
  const message = mockIMessage();
  const messageRecord = mockIMessageRecord({ ...message, ExternalUserID: externalUserID });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Test Fixtures
    context = mockEventContext('deleteNotification');
    event = mockFlexAPIEvent({
      pathParameters: { notificationID },
      queryStringParameters: { externalUserID },
    }) as unknown as EventType;

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    // Mocking successful completion of service functions
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(messageRecord);

    instance = new DeleteNotification(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('deleteNotification');
  });

  it('should return 204 with status ok and return a notification', async () => {
    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(204);
  });

  it('should call publish event with the NotificationStateEnum.hidden', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      messageRecord,
      NotificationStateEnum.HIDDEN
    );
  });

  it('should return 400 when notificationID is missing from path params', async () => {
    // Arrange
    const eventWithoutNotificationID = mockFlexAPIEvent({
      pathParameters: {},
      queryStringParameters: { externalUserID },
    }) as unknown as EventType;

    // Act
    const result = await handler(eventWithoutNotificationID, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['notificationID has not been provided'],
    });
  });

  it('should return 400 when externalUserID/pushID is undefined', async () => {
    // Arrange
    const eventWithoutExternalUserID = mockFlexAPIEvent({
      pathParameters: { notificationID },
      queryStringParameters: {},
    }) as unknown as EventType;

    // Act
    const result = await handler(eventWithoutExternalUserID, context);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['pushID has not been provided'],
    });
  });

  it('should return 400 when externalUserID is an empty string', async () => {
    // Arrange
    const eventWithoutExternalUserID = mockFlexAPIEvent({
      pathParameters: { notificationID },
      queryStringParameters: { externalUserID: '' },
    }) as unknown as EventType;

    // Act
    const result = await handler(eventWithoutExternalUserID, context);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['pushID has not been provided'],
    });
  });

  it('should return 400 when pushID is an empty string', async () => {
    // Arrange
    const eventWithoutPushID = mockFlexAPIEvent({
      pathParameters: { notificationID },
      queryStringParameters: { pushID: '' },
    }) as unknown as EventType;

    // Act
    const result = await handler(eventWithoutPushID, context);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['pushID has not been provided'],
    });
  });

  it('should return 404 when notification is not returned from DynamoDB', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValueOnce(null);

    // Act
    const result = await handler(event, context);

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
    const mockDbRecordUnauthorized = { ...messageRecord, ExternalUserID: 'invalid' };
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValueOnce(mockDbRecordUnauthorized);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({
      Status: 404,
      HttpError: 'NotFound',
      Errors: [],
    });
  });
});
