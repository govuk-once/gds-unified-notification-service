import { ChannelsEnum, NotificationStateEnum } from '@common/models';
import { PostMessage } from '@project/lambdas/pso/http.postMessage/handler';
import {
  iocSpies,
  mockAPIPostMessageEvent,
  mockEventContext,
  mockIMessage_NoOrgID,
  mockPsoAPIEventWithChannelsControl,
  mockPsoAPIEventWithMessageRetention,
  mockServicesExpectedBehaviour,
  mockUnauthorizedPsoAPIEvent,
} from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PostMessage Handler', () => {
  let instance: PostMessage;
  let handler: ReturnType<typeof PostMessage.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Test fixtures
  let context: Context;
  let event: EventType;

  const message = mockIMessage_NoOrgID();

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Test fixtures
    context = mockEventContext('postMessage');
    event = mockAPIPostMessageEvent([message]) as unknown as EventType;

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    // Mocking retrieving store apiKey
    instance = new PostMessage(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      processingQueue: serviceMocks.processingQueueServiceMock.initialize(),
      validationService: Promise.resolve(serviceMocks.validationServiceMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postMessage');
  });

  it('should send messages to processing queue.', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
      { ...message, OrganisationID: 'ORG01' },
    ]);
  });

  it('should stamp OrganisationID from the mTLS cert onto queued, recorded and analytics messages', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
      { ...message, OrganisationID: event.requestContext.authorizer?.Organization },
    ]);
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [
        {
          ...message,
          OrganisationID: event.requestContext.authorizer!.Organization,
          APIGWExtendedID: event.requestContext.requestId,
        },
      ],
      NotificationStateEnum.VALIDATED_API_CALL
    );
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({ OrganisationID: event.requestContext.authorizer!.Organization }),
    ]);
  });

  it('should return 400 when mTLS certificate does not resolve an organisation', async () => {
    // Arrange
    const unauthorizedEvent = mockUnauthorizedPsoAPIEvent(message) as unknown as EventType;

    // Act
    const result = await handler(unauthorizedEvent, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).not.toHaveBeenCalled();
  });

  it('should make a record of notifications messages', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      {
        ...message,
        OrganisationID: 'ORG01',
        APIGWExtendedID: event.requestContext.requestId,
        ReceivedDateTime: new Date(event.requestContext.requestTimeEpoch).toISOString(),
        ValidatedDateTime: date.toISOString(),
        Events: [],
      },
    ]);
  });

  it('should make a record using expire in days if given in payload', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);
    const messageWithExpiresInDay = { ...message, ExpiresInDays: 25 };
    const eventWithExpiresInDay = mockPsoAPIEventWithMessageRetention([
      messageWithExpiresInDay,
    ]) as unknown as EventType;

    // Act
    await handler(eventWithExpiresInDay, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      {
        ...message,
        OrganisationID: 'ORG01',
        APIGWExtendedID: event.requestContext.requestId,
        ReceivedDateTime: new Date(event.requestContext.requestTimeEpoch).toISOString(),
        ValidatedDateTime: date.toISOString(),
        RequestedDaysToExpire: 25,
        Events: [],
      },
    ]);
  });

  it('should reject any notification where the ExpiresInDays is a negative', async () => {
    // Arrange
    const messageWithInvalidExpiresInDays = {
      ...message,
      ExpiresInDays: -1,
    };
    const eventWithInvalidExpiresInDays = mockAPIPostMessageEvent([
      messageWithInvalidExpiresInDays,
    ]) as unknown as EventType;

    // Act
    const result = await handler(eventWithInvalidExpiresInDays, context);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          Status: 400,
          HttpError: 'BadRequest',
          Errors: ['Too small: expected number to be >0 → at 0.ExpiresInDays.'],
        }),
        statusCode: 400,
      })
    );
  });

  it('should reject any notification where the ExpiresInDays is a float', async () => {
    // Arrange
    const messageWithInvalidExpiresInDays = {
      ...message,
      ExpiresInDays: 0.5,
    };
    const eventWithInvalidExpiresInDays = mockAPIPostMessageEvent([
      messageWithInvalidExpiresInDays,
    ]) as unknown as EventType;

    // Act
    const result = await handler(eventWithInvalidExpiresInDays, context);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          Status: 400,
          HttpError: 'BadRequest',
          Errors: ['Invalid input: expected int, received number → at 0.ExpiresInDays.'],
        }),
        statusCode: 400,
      })
    );
  });

  it('should send VALIDATED_API_CALL event to analytics queue.', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [{ ...message, OrganisationID: 'ORG01', APIGWExtendedID: event.requestContext.requestId }],
      NotificationStateEnum.VALIDATED_API_CALL
    );
  });

  it('should return a status 202 and list of NotificationIDs when call is successful.', async () => {
    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([{ NotificationID: message.NotificationID }]);
  });

  it('should accept a message with Channel set to PUSH_NOTIFICATION_AND_MESSAGE_CENTRE', async () => {
    // Arrange
    const messageWithChannel = {
      ...message,
      Channel: ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
    };
    const eventWithChannel = mockPsoAPIEventWithChannelsControl([messageWithChannel]) as unknown as EventType;

    // Act
    const result = await handler(eventWithChannel, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([{ NotificationID: message.NotificationID }]);
  });

  it('should accept a message with Channel set to MESSAGE_CENTRE_ONLY', async () => {
    // Arrange
    const messageWithChannel = {
      ...message,
      Channel: ChannelsEnum.MESSAGE_CENTRE_ONLY,
    };
    const eventWithChannel = mockPsoAPIEventWithChannelsControl([messageWithChannel]) as unknown as EventType;

    // Act
    const result = await handler(eventWithChannel, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([{ NotificationID: messageWithChannel.NotificationID }]);
  });

  it('should accept a message when Channel is omitted', async () => {
    // Arrange
    const eventWithChannel = mockPsoAPIEventWithChannelsControl([message]) as unknown as EventType;

    // Act
    const result = await handler(eventWithChannel, context);

    // Assert
    expect(result.statusCode).toEqual(202);
  });

  it('should return 400 when Channel is an empty string', async () => {
    // Arrange
    const messageWithEmptyChannel = {
      ...message,
      Channel: '',
    };
    const eventWithEmptyChannel = mockAPIPostMessageEvent([messageWithEmptyChannel]) as unknown as EventType;

    // Act
    const result = await handler(eventWithEmptyChannel, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: [
        'Invalid option: expected one of \"PUSH_NOTIFICATION_AND_MESSAGE_CENTRE\"|\"MESSAGE_CENTRE_ONLY\" → at 0.Channel.',
      ],
    });
  });

  it('should return 400 when Channel is an invalid enum value', async () => {
    // Arrange
    const messageWithInvalidChannel = {
      ...message,
      Channel: 'INVALID_CHANNEL',
    };
    const eventWithInvalidChannel = mockAPIPostMessageEvent([messageWithInvalidChannel]) as unknown as EventType;

    // Act
    const result = await handler(eventWithInvalidChannel, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: [
        'Invalid option: expected one of \"PUSH_NOTIFICATION_AND_MESSAGE_CENTRE\"|\"MESSAGE_CENTRE_ONLY\" → at 0.Channel.',
      ],
    });
  });

  it('should return 400 when Channel is a lowercase variant of a valid enum', async () => {
    // Arrange
    const messageWithLowercaseChannel = {
      ...message,
      Channel: 'push_notification_and_message_centre',
    };
    const eventWithLowercaseChannel = mockAPIPostMessageEvent([messageWithLowercaseChannel]) as unknown as EventType;

    // Act
    const result = await handler(eventWithLowercaseChannel, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: [
        'Invalid option: expected one of \"PUSH_NOTIFICATION_AND_MESSAGE_CENTRE\"|\"MESSAGE_CENTRE_ONLY\" → at 0.Channel.',
      ],
    });
  });
});
