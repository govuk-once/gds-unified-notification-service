import { NotificationDispatchedStateEnum } from '@common/models/NotificationStateEnum';
import { GetFlexNotificationById } from '@project/lambdas/flex/http.getNotificationById/handler';
import { mockIAnalytics, mockIFlexNotification } from '@project/lambdas/interfaces';
import {
  iocSpies,
  mockEventContext,
  mockFlexAPIEvent,
  mockIOrganisationRecord,
  mockIProcessedMessage,
  mockIProcessedMessageRecord,
  mockServicesExpectedBehaviour,
} from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetNotificationById Handler', async () => {
  let instance: GetFlexNotificationById;
  let handler: ReturnType<typeof GetFlexNotificationById.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = await iocSpies();

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
  it('should return 400 when notificationID is missing', async () => {
    // Arrange
    const eventWithNoNotificationID = mockFlexAPIEvent({
      pathParameters: {},
      queryStringParameters: { externalUserID },
    }) as unknown as EventType;

    // Act
    const result = await handler(eventWithNoNotificationID, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['notificationID has not been provided'],
    });
  });

  it('should return a 400 when both externalUserID and pushID are missing', async () => {
    // Arrange
    const eventWithNoPushID = mockFlexAPIEvent({
      pathParameters: { notificationID },
      queryStringParameters: {},
    }) as unknown as EventType;

    // Act
    const result = await handler(eventWithNoPushID, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['pushID has not been provided'],
    });
  });

  it('should return 400 when externalUserId query parameter is an empty string', async () => {
    // Arrange
    const eventWithNoPushID = mockFlexAPIEvent({
      pathParameters: { notificationID },
      queryStringParameters: { externalUserID: '' },
    }) as unknown as EventType;

    // Act
    const result = await handler(eventWithNoPushID, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when the notification is missing from the database', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessageByID.mockResolvedValue(undefined);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
  });

  it('should return a 404 when user is not the owner of the notification', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessageByID.mockResolvedValue({
      ...messageRecord,
      ExternalUserID: 'another_user',
    });

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
  });

  it('should return 404 when the noitification is marked as hidden in the database', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessageByID.mockResolvedValue({
      ...messageRecord,
      Events: [mockIAnalytics(NotificationDispatchedStateEnum.HIDDEN)],
    });

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
  });
});
