import { GroupActionEnum } from '@common/models';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { PostGroups } from '@project/lambdas/flex/http.postGroups/handler';
import { IModifyGroups } from '@project/lambdas/interfaces';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PatchNotification Handler', () => {
  let instance: PostGroups;
  let handler: ReturnType<typeof PostGroups.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'postGroup',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockEvent: EventType;
  let mockUnauthorizedEvent: EventType;
  let mockMissingIdEvent: EventType;

  const mockUserID = `5f41e336-c06f-468b-99be-69aa77c1dec7`;

  const mockModifyGroupsRequest: IModifyGroups = [
    {
      Namespace: 'travel',
      Group: 'france',
      Subgroup: 'IMMEDIATE',
      Action: GroupActionEnum.JOIN,
    },
    {
      Namespace: 'travel',
      Group: 'spain',
      Action: GroupActionEnum.LEAVE,
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
        'content-type': 'application/json',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      pathParameters: {
        userID: mockUserID,
      },
      body: JSON.stringify(mockModifyGroupsRequest),
    } as unknown as EventType;

    mockMissingIdEvent = {
      ...mockEvent,
      pathParameters: {},
    };

    instance = new PostGroups(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      groupStoreDynamoRepository: Promise.resolve(serviceMocks.groupStoreDynamoRepositoryMock),
    }));

    handler = instance.handler();
    serviceMocks.groupStoreDynamoRepositoryMock.createRecordBatch = vi.fn().mockResolvedValue(undefined);
    serviceMocks.groupStoreDynamoRepositoryMock.deleteRecord = vi.fn().mockResolvedValue(undefined);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postGroups');
  });

  it('should accept valid enums (upper and lowercased) and return 202 - %s, while rejecting any other', async (enumValue: string, expectedStatusCode: number) => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(
      {
        ...mockEvent,
        body: JSON.stringify({
          Status: enumValue,
        }),
      },
      mockContext
    );

    // Assert
    expect(result.statusCode).toEqual(expectedStatusCode);
  });

  it('should call publishEvent to update the notification', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      mockDbRecord,
      NotificationStateEnum.READ
    );
  });

  it('should log info when updating notification status', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.debug).toHaveBeenCalledWith('Successful request - returning 200', {
      notificationID: mockDbRecord.NotificationID,
      status: 'READ',
    });
  });

  it('should log and return 400 when notificationID is missing', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    // Act
    const result = await handler(mockMissingIdEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.debug).toHaveBeenCalledWith(
      'NotificationID has not been provided - returning 400'
    );
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['NotificationID has not been provided'],
    });
  });

  it('should return 404 when notifications does not exist', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(null);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({ Status: 404, HttpError: 'NotFound', Errors: [] });
  });
  it('should return 400 when externalUserID/pushID is undefined', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {};

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
  it('should return 400 when externalUserID is an empty string', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {
      externalUserID: '',
    };

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
  it('should return 400 when pushID is an empty string', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
    serviceMocks.notificationsDynamoRepositoryMock.getRecord.mockResolvedValue(mockDbRecord);
    mockEvent.queryStringParameters = {
      pushID: '',
    };

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
});
