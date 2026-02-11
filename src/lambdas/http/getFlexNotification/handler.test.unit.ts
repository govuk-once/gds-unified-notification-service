/* eslint-disable @typescript-eslint/unbound-method */
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetFlexNotification } from '@project/lambdas/http/getFlexNotification/handler';
import { PostMessage } from '@project/lambdas/http/postMessage/handler';
import { IFlexNotificationSchema } from '@project/lambdas/interfaces/IFlexNotificationSchema';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PostMessage Handler', () => {
  let instance: GetFlexNotification;
  let handler: ReturnType<typeof PostMessage.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'getFlexNotification',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockAuthorizedEvent: EventType;
  let mockUnauthorizedEvent: EventType;
  let mockEvent: EventType;

  const mockMessageBody: IFlexNotificationSchema = {
    NotificationID: '1234',
    MessageTitle: 'You have a new Message',
    MessageBody: 'Open Notification Centre to read your notifications',
    NotificationTitle: 'You have a new Notification',
    NotificationBody: 'Here is the Notification body.',
    Status: 'PENDING',
    DispatchedAt: '2026-01-22T00:00:01Z',
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mockEvent = {
      body: JSON.stringify([mockMessageBody]),
      headers: {
        'x-api-key': 'mockApiKey',
        'Content-Type': `application/json`,
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
    } as unknown as EventType;

    mockAuthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockApiKey',
        'Content-Type': `application/json`,
      },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockBadApiKey',
        'Content-Type': `application/json`,
      },
    } as unknown as EventType;

    instance = new GetFlexNotification(serviceMocks.configurationServiceMock, observabilityMocks);
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getFlexNotification');
  });

  it('should return 200 with status ok when valid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockAuthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
  });

  it('should return 401 with status unauthorized when valid API key is provided', async () => {
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
    await handler(mockAuthorizedEvent, mockContext);

    // Assert
    expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith('api/flex/apiKey');
  });
});
