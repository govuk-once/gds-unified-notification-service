/* eslint-disable @typescript-eslint/unbound-method */
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetFlexNotificationById } from '@project/lambdas/flex/http.getNotificationById/handler';
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
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

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'getFlexNotificationById',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockUnauthorizedEvent: EventType;
  let mockInternalServerError: EventType;
  let mockEvent: EventType;

  let mockDbRecord: IMessageRecord;
  let mockResponse: IFlexNotification;

  beforeEach(() => {
    vi.resetAllMocks();
    //
    const notificationID = `efe72235-d02a-45a9-b9d4-a04ff992fcc3`;
    // Mock events
    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      pathParameters: {
        notificationId: notificationID,
      },
    } as unknown as EventType;

    mockUnauthorizedEvent = {
      ...mockEvent,
      headers: {
        'x-api-key': 'mockBadApiKey',
      },
    } as unknown as EventType;

    mockInternalServerError = null as unknown as EventType;

    // Reset db object
    mockDbRecord = {
      NotificationID: notificationID,
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new Notification',
      NotificationBody: 'Here is the Notification body.',
      Events: [
        {
          EventID: '00000000-0000-0000-0000-a04ff992fcc3',
          NotificationID: notificationID,
          DepartmentID: 'abc',
          Event: NotificationStateEnum.RECEIVED,
          EventDateTime: new Date().toISOString(),
          EventReason: '',
          APIGWExtendedID: 'Test',
        },
      ],
      DispatchedDateTime: '2026-02-13',
    } as IMessageRecord;

    // Reset expected response
    mockResponse = {
      DispatchedDateTime: '2026-02-13',
      MessageBody: 'Open Notification Centre to read your notifications',
      MessageTitle: 'You have a new Message',
      NotificationBody: 'Here is the Notification body.',
      NotificationID: notificationID,
      NotificationTitle: 'You have a new Notification',
      Status: NotificationStateEnum.RECEIVED,
    };

    instance = new GetFlexNotificationById(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
    }));

    handler = instance.handler();

    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotificationById');
  });

  it('should return 200 with status ok when valid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Successful request.', {
      notificationId: mockDbRecord.NotificationID,
    });
  });

  it('should return 200 with status ok and return a notification', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual(mockResponse);
  });

  it('should get notification from getRecord call', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.getRecord).toHaveBeenCalledWith(
      mockEvent.pathParameters.notificationId
    );
  });

  it('should fetch API key from config service', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith('api/flex/apiKey');
  });

  it('should handle errors when calling API key with status internal server error', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockInternalServerError, mockContext);

    // Assert
    expect(result.statusCode).toEqual(500);
  });

  it('return internal server error when config servers throws an error', async () => {
    // Arrange
    const error = new Error('Config Service Error');
    serviceMocks.configurationServiceMock.getParameter.mockRejectedValueOnce(error);

    // Act
    const result = await handler(mockInternalServerError, mockContext);

    // Assert
    expect(result.statusCode).toEqual(500);
  });

  it('should return 401 with status unauthorized when invalid API key is provided', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockUnauthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(401);
  });

  it('should return 404 for expired notification notification from getRecord call', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue({
      ...mockDbRecord,
      ExpirationDateTime: new Date(0).toISOString(),
    });

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
  });
});
