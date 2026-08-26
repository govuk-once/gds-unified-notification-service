import { mockIOrganisationRecord, mockIProcessedMessageRecord } from '@common/repositories';
import { GetFlexNotificationById } from '@project/lambdas/flex/http.getNotificationById/handler';
import { mockIFlexNotification } from '@project/lambdas/interfaces';
import {
  iocSpies,
  mockEventContext,
  mockFlexAPIEvent,
  mockIProcessedMessage,
  mockServicesExpectedBehaviour,
} from '@test/mocks';
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

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Test Fixtures
  let context: Context;
  let event: EventType;

  const notificationID = 'efe72235-d02a-45a9-b9d4-a04ff992fcc3';
  const externalUserID = 'test_user';
  const message = mockIProcessedMessage();
  const messageRecord = mockIProcessedMessageRecord(message, { DispatchedDateTime: true });
  const organisationRecord = mockIOrganisationRecord();

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();

    // Test Fixtures
    context = mockEventContext('getFlexNotificationById');
    event = mockFlexAPIEvent({
      pathParameters: {
        notificationID: notificationID,
      },
      queryStringParameters: {
        externalUserID: externalUserID,
      },
    }) as unknown as EventType;

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    // Mocking successful completion of service functions
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessageByID.mockResolvedValue(messageRecord);
    serviceMocks.organisationsDynamoRepositoryMock.getOrganisations.mockResolvedValue([organisationRecord]);

    instance = new GetFlexNotificationById(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      organisationsDynamoRepository: Promise.resolve(serviceMocks.organisationsDynamoRepositoryMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotificationById');
  });

  it('should return 200 with status ok when valid API key is provided', async () => {
    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Successful request - returning 200', {
      notificationID: messageRecord.NotificationID,
    });
  });

  it('should return 200 with status ok and return a notification', async () => {
    // Arrange
    const expectedResponse = mockIFlexNotification();

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual(expectedResponse);
  });

  it('should return 200 with status ok and return a notification - using pushID query parameter', async () => {
    // Arrange
    const eventWithPushID = mockFlexAPIEvent({
      pathParameters: {
        notificationID: notificationID,
      },
      queryStringParameters: {
        pushID: externalUserID,
      },
    }) as unknown as EventType;
    const expectedResponse = mockIFlexNotification();

    // Act
    const result = await handler(eventWithPushID, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual(expectedResponse);
  });

  it('should get notification from getRecord call', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessageByID).toHaveBeenCalledWith(notificationID);
  });

  it('should return 404 for expired notification notification from getRecord call', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessageByID.mockResolvedValue({
      ...messageRecord,
      ExpirationDateTime: new Date(0).toISOString(),
    });

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
  });

  it('should return 404 where the organisation DisplayName was not retrieved from dynamoDB and log the issue', async () => {
    // Arrange
    serviceMocks.organisationsDynamoRepositoryMock.getOrganisations.mockResolvedValueOnce([]);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
      'No organisation matches the DepartmentID in the notification.',
      { OrganisationID: messageRecord.OrganisationID }
    );
  });

  it('should return 400 when externalUserID/pushID is undefined', async () => {
    // Arrange
    const eventWithNoPushID = mockFlexAPIEvent({ pathParameters: {} }) as unknown as EventType;

    // Act
    const result = await handler(eventWithNoPushID, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when pushId is an empty string', async () => {
    // Arrange
    const eventWithNoPushID = mockFlexAPIEvent({ pathParameters: { pushID: '' } }) as unknown as EventType;

    // Act
    const result = await handler(eventWithNoPushID, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when externalUserID is an empty string', async () => {
    // Arrange
    const eventWithNoPushID = mockFlexAPIEvent({ pathParameters: { externalUserID: '' } }) as unknown as EventType;

    // Act
    const result = await handler(eventWithNoPushID, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
});
