import { NotificationStateEnum } from '@common/models';
import { GetNotifications } from '@project/lambdas/flex/http.getNotifications/handler';
import { mockIFlexNotification } from '@project/lambdas/interfaces';
import {
  iocSpies,
  mockEventContext,
  mockFlexAPIEvent,
  mockIAnalytics,
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

describe('getNotifications Handler', async () => {
  let instance: GetNotifications;
  let handler: ReturnType<typeof GetNotifications.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = await iocSpies();

  // Test Fixtures
  let context: Context;
  let event: EventType;

  const message = mockIProcessedMessage();
  const messageRecord = mockIProcessedMessageRecord(message, {
    DispatchedDateTime: true,
  });
  const organisationRecord = mockIOrganisationRecord();
  const externalUserID = `abc-cdef-ghi`;
  const hiddenAnalyticsEvent = mockIAnalytics(NotificationStateEnum.HIDDEN);

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();

    // Test Fixtures
    context = mockEventContext('getNotifications');
    event = mockFlexAPIEvent({
      queryStringParameters: { externalUserID },
    }) as unknown as EventType;

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    // Mocking successful completion of service functions
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessages.mockResolvedValue([messageRecord]);
    serviceMocks.organisationsDynamoRepositoryMock.getOrganisations.mockResolvedValue([organisationRecord]);

    instance = new GetNotifications(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      organisationsDynamoRepository: Promise.resolve(serviceMocks.organisationsDynamoRepositoryMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotifications');
  });

  it('should return 200 with status ok and return a notification', async () => {
    // Arrange
    const expectResponse = mockIFlexNotification();

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([expectResponse]);
  });

  it('should fetch all notifications from dynamo tabling using getRecordsQuery', async () => {
    // Act
    const { statusCode } = await handler(event, context);

    // Assert
    expect(statusCode).toEqual(200);
    expect(serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessages).toHaveBeenCalledWith(externalUserID);
  });

  it('should exclude all notifications with expiry date in the past from getRecordsQuery call', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessages.mockResolvedValueOnce([
      {
        ...messageRecord,
        ExpirationDateTime: new Date(0).toISOString(), // 1970
      },
    ]);

    // Act
    const { body, statusCode } = await handler(event, context);

    // Assert
    expect(statusCode).toEqual(200);
    const results = JSON.parse(body) as [];
    expect(results.length).toEqual(0);
  });

  it('should return an empty array when there are no notifications', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessages = vi.fn().mockResolvedValueOnce([]);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should exclude notifications with HIDDEN status', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getProcessedMessages.mockResolvedValueOnce([
      {
        ...messageRecord,
        Events: [hiddenAnalyticsEvent],
      },
    ]);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should exclude notifications where the organisation DisplayName was not retrieved from dynamoDB and log the issue', async () => {
    // Arrange
    serviceMocks.organisationsDynamoRepositoryMock.getOrganisations.mockResolvedValueOnce([]);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([]);
    expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
      'No organisation matches the DepartmentID in the notification.',
      { OrganisationID: messageRecord.OrganisationID }
    );
  });

  it('should return 400 when externalUserID/pushID is undefined', async () => {
    // Arrange
    const emptyEvent = mockFlexAPIEvent({
      queryStringParameters: {},
    }) as unknown as EventType;

    // Act
    const result = await handler(emptyEvent, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when pushID is an empty string', async () => {
    // Arrange
    const emptyEvent = mockFlexAPIEvent({
      queryStringParameters: { pushID: '' },
    }) as unknown as EventType;

    // Act
    const result = await handler(emptyEvent, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 400 when externalUserID is an empty string', async () => {
    // Arrange
    const emptyEvent = mockFlexAPIEvent({
      queryStringParameters: { externalUserID: '' },
    }) as unknown as EventType;

    // Act
    const result = await handler(emptyEvent, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
});
