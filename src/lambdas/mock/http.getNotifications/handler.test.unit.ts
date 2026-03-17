/* eslint-disable @typescript-eslint/unbound-method */
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { MockGetNotifications } from '@project/lambdas/mock/http.getNotifications/handler';
import { MOCK_NOTIFICATIONS } from '@project/lambdas/mock/mockNotifications';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('mockGetNotifications Handler', () => {
  let instance: MockGetNotifications;
  let handler: ReturnType<typeof MockGetNotifications.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'mockGetNotifications',
    awsRequestId: '12345',
  } as unknown as Context;

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
      queryStringParameters: { externalUserId: 'user-ABC' },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockAuthorizedEvent,
      headers: { 'x-api-key': 'mockBadApiKey' },
    } as unknown as EventType;

    instance = new MockGetNotifications(serviceMocks.configurationServiceMock, observabilityMocks);
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('mockGetNotifications');
  });

  it('should return 200 with all stub notifications', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');

    // Act
    const result = await handler(mockAuthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toHaveLength(MOCK_NOTIFICATIONS.length);
  });

  it('should return the correct notification shape', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');

    // Act
    const result = await handler(mockAuthorizedEvent, mockContext);
    const body = JSON.parse(result.body) as Array<Record<string, unknown>>;

    // Assert
    expect(body[0]).toMatchObject({
      NotificationID: expect.any(String) as unknown,
      NotificationTitle: expect.any(String) as unknown,
      NotificationBody: expect.any(String) as unknown,
      MessageTitle: expect.any(String) as unknown,
      MessageBody: expect.any(String) as unknown,
    });
  });

  it('should return 400 when externalUserId is missing', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');
    const eventWithoutUserId = {
      ...mockAuthorizedEvent,
      queryStringParameters: {},
    } as unknown as EventType;

    // Act
    const result = await handler(eventWithoutUserId, mockContext);

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

  it('should fetch the API key from config service', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('mockApiKey');

    // Act
    await handler(mockAuthorizedEvent, mockContext);

    // Assert
    expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith('api/flex/apiKey');
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
