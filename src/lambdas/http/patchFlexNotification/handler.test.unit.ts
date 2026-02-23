/* eslint-disable @typescript-eslint/unbound-method */
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { PatchFlexNotification } from '@project/lambdas/http/patchFlexNotification/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PatchFlexNotification Handler', () => {
  let instance: PatchFlexNotification;
  let handler: ReturnType<typeof PatchFlexNotification.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'patchFlexNotification',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockEvent: EventType;
  let mockUnauthorizedEvent: EventType;
  let mockMissingIdEvent: EventType;

  const mockNotification = {
    notificationID: '12345',
    messageTitle: 'You have a new Message',
    messageBody: 'Open Notification Centre to read your notifications',
    notificationTitle: 'You have a new Notification',
    notificationBody: 'Here is the Notification body.',
    status: 'READ',
    dispatchedAt: '2026-02-13T00:00:01Z',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-13T10:00:00Z'));

    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      queryStringParameters: {
        id: '12345',
      },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockBadApiKey',
      },
    } as unknown as EventType;

    mockMissingIdEvent = {
      ...mockEvent,
      queryStringParameters: {},
    } as unknown as EventType;

    instance = new PatchFlexNotification(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      inboundNotificationTable: Promise.resolve(serviceMocks.inboundDynamoRepositoryMock),
    }));

    handler = instance.handler();
    serviceMocks.inboundDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(mockNotification);
    serviceMocks.inboundDynamoRepositoryMock.updateRecord = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('patchFlexNotificationStatus');
  });

  it('should return 202 with status ok when valid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(202);
  });

  it('should call updateRecord to fetch a notification', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.inboundDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith({
      NotificationID: mockNotification.notificationID,
      Status: 'READ',
      UpdatedAt: '2026-02-13T10:00:00.000Z',
    });
  });

  it('should log info when updating notification status', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Successful request.', {
      notificationId: mockNotification.notificationID,
      status: 'READ',
    });
  });

  it('should return 401 with status unauthorized when valid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
  });

  it('should return 400 when notificationId is missing', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockMissingIdEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });

  it('should log error when notificationID is missing', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockMissingIdEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Notification Id has not been provided.');
  });

  it('should return 401 with status unauthorized and should return empty array', async () => {
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
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith('api/flex/apiKey');
  });

  it('should log error when config servers throws an error', async () => {
    // Arrange
    const error = new Error('Config Service Error');
    serviceMocks.configurationServiceMock.getParameter.mockRejectedValueOnce(error);

    // Act
    await handler(mockMissingIdEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Fatal exception: ', { error });
  });

  it('should return 404 when notifications does not exist', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.inboundDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(null);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
  });
});
