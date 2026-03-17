import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { MockGetNotificationById } from '@project/lambdas/mock/http.getNotificationById/handler';
import { MOCK_NOTIFICATIONS } from '@project/lambdas/mock/mockNotifications';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('mockGetNotificationById Handler', () => {
  let instance: MockGetNotificationById;
  let handler: ReturnType<typeof MockGetNotificationById.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'mockGetNotificationById',
    awsRequestId: '12345',
  } as unknown as Context;

  const existingId = MOCK_NOTIFICATIONS[0].NotificationID;
  const unknownId = '00000000-0000-0000-0000-000000000000';

  let mockAuthorizedEvent: EventType;
  let mockUnauthorizedEvent: EventType;

  beforeEach(() => {
    vi.resetAllMocks();

    mockAuthorizedEvent = {
      headers: { 'x-api-key': 'mockApiKey' },
      requestContext: {
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        requestTimeEpoch: 1428582896000,
      },
      pathParameters: { notificationId: existingId },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockAuthorizedEvent,
      headers: { 'x-api-key': 'mockBadApiKey' },
    } as unknown as EventType;

    instance = new MockGetNotificationById(serviceMocks.configurationServiceMock, observabilityMocks);
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('mockGetNotificationById');
  });

  it('should return 200 with the matching stub notification', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');

    // Act
    const result = await handler(mockAuthorizedEvent, mockContext);
    const body = JSON.parse(result.body) as { NotificationID: string };

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(body.NotificationID).toEqual(existingId);
  });

  it('should return 404 when the notification ID is not in the mock set', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');
    const eventWithUnknownId = {
      ...mockAuthorizedEvent,
      pathParameters: { notificationId: unknownId },
    } as unknown as EventType;

    // Act
    const result = await handler(eventWithUnknownId, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
  });

  it('should return 400 when notificationId is missing', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');
    const eventWithoutId = {
      ...mockAuthorizedEvent,
      pathParameters: {},
    } as unknown as EventType;

    // Act
    const result = await handler(eventWithoutId, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should return 401 when an invalid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');

    // Act
    const result = await handler(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
  });

  it('should return 500 when the event is null', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');

    // Act
    const result = await handler(null as unknown as EventType, mockContext);

    // Assert
    expect(result.statusCode).toEqual(500);
  });
});
