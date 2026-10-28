import { IRequestEvent } from '@common/middlewares';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { GetNotificationStatus } from '@project/lambdas/pso/http.getNotificationStatus/handler';
import {
  iocSpies,
  mockEventContext,
  mockIAnalytics,
  mockIMessageRecord,
  mockIProcessedMessage,
  mockServicesExpectedBehaviour,
} from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetNotificationStatus Handler', async () => {
  let instance: GetNotificationStatus;
  let handler: ReturnType<typeof GetNotificationStatus.prototype.handler>;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = await iocSpies();

  // Test fixtures
  let context: Context;
  let event: IRequestEvent;
  const notificationID = 'c9342301-bd36-4f06-a1dc-0383a7d2eb1a';
  const message = mockIProcessedMessage();
  const messageRecord = mockIMessageRecord(message);

  beforeEach(() => {
    vi.resetAllMocks();
    // Test Fixtures
    context = mockEventContext('getNotificationStatus');
    event = { pathParameters: { notificationID } } as unknown as IRequestEvent;

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    instance = new GetNotificationStatus(observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      cacheService: Promise.resolve(serviceMocks.cacheServiceMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotificationStatus');
  });

  it('should log "Received request" when implementation is called', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(undefined);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({ Status: 404, HttpError: 'NotFound', Errors: [] });
  });

  it('should fetch the record using the notificationID path parameter', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue({
      ...messageRecord,
    });

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.getRecord).toHaveBeenCalledWith(notificationID);
  });

  it('should return 200 with the events mapped to status entries, sorted using the timestamp', async () => {
    // Arrange
    const earlierEvent = {
      ...mockIAnalytics('eb456589-f3e2-4384-9344-853ad05147e5', NotificationStateEnum.RECEIVED),
      EventDateTime: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    };
    const laterEvent = {
      ...mockIAnalytics('5a2145b8-5b6b-4136-8e3b-ad02662b0e9e', NotificationStateEnum.READ),
      EventDateTime: new Date('2026-01-02T00:00:00.000Z').toISOString(),
    };
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValueOnce({
      ...messageRecord,
      Events: [laterEvent, earlierEvent],
    });

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([
      {
        EventTimestamp: earlierEvent.EventDateTime,
        NotificationID: earlierEvent.NotificationID,
        Status: earlierEvent.Event,
      },
      {
        EventTimestamp: laterEvent.EventDateTime,
        NotificationID: laterEvent.NotificationID,
        Status: laterEvent.Event,
      },
    ]);
  });

  it('should return 200 with an empty array if there are no events', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValueOnce({
      ...messageRecord,
      Events: [],
    });

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should return 200 and use events from cache if not present in dynamodb record', async () => {
    // Arrange
    const cachedEvents = [
      {
        ...mockIAnalytics('eb456589-f3e2-4384-9344-853ad05147e5', NotificationStateEnum.VALIDATED_API_CALL),
        EventDateTime: new Date('2026-01-02T00:00:00.000Z').toISOString(),
      },
      {
        ...mockIAnalytics('5a2145b8-5b6b-4136-8e3b-ad02662b0e9e', NotificationStateEnum.PROCESSING),
        EventDateTime: new Date('2026-01-02T00:00:00.000Z').toISOString(),
      },
    ];
    serviceMocks.cacheServiceMock.getList = vi.fn().mockResolvedValueOnce(cachedEvents);

    const notificationEvent = {
      ...mockIAnalytics('eb456589-f3e2-4384-9344-853ad05147e5', NotificationStateEnum.VALIDATED_API_CALL),
      EventDateTime: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    };
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValueOnce({
      ...messageRecord,
      Events: [notificationEvent],
    });

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([
      {
        EventTimestamp: notificationEvent.EventDateTime,
        NotificationID: notificationEvent.NotificationID,
        Status: notificationEvent.Event,
      },
      {
        EventTimestamp: cachedEvents[1].EventDateTime,
        NotificationID: cachedEvents[1].NotificationID,
        Status: cachedEvents[1].Event,
      },
    ]);
  });
});
