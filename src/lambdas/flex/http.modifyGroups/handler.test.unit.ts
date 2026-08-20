import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { ModifyGroups } from '@project/lambdas/flex/http.modifyGroups/handler';
import { GroupActionEnum, IGroups, IModifyGroups } from '@project/lambdas/interfaces';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('ModifyGroups Handler', () => {
  let instance: ModifyGroups;
  let handler: ReturnType<typeof ModifyGroups.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  const mockContext = {
    functionName: 'modifyGroups',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockEvent: EventType;
  let mockMissingIdEvent: EventType;

  const mockPushID = `5f41e336-c06f-468b-99be-69aa77c1dec7`;

  const mockModifyGroupsRequest: IModifyGroups[] = [
    {
      Namespace: 'travel',
      Group: 'france',
      Subgroup: 'IMMEDIATE',
      Action: GroupActionEnum.JOIN,
    },
    {
      Namespace: 'travel',
      Group: 'spain',
      Subgroup: 'IMMEDIATE',
      Action: GroupActionEnum.LEAVE,
    },
  ];
  const mockUsersGroups: IGroups[] = [
    {
      GroupID: 'GROUP-01',
      CompositeID: `travel/spain/IMMEDIATE`,
      Namespace: 'travel',
      Group: 'spain',
      Subgroup: 'IMMEDIATE',
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
      queryStringParameters: {
        pushID: mockPushID,
      },
      body: JSON.stringify(mockModifyGroupsRequest),
    } as unknown as EventType;

    instance = new ModifyGroups(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      groupStoreDynamoRepository: Promise.resolve(serviceMocks.groupStoreDynamoRepositoryMock),
    }));

    handler = instance.handler();
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('modifyGroups');
  });

  it.each([
    ['JOIN', 200],
    ['LEAVE', 200],
    ['invalid-enum', 400],
  ])(
    'should accept valid action enums (upper and lowercased) and return 200 - %s, while rejecting any other',
    async (enumValue: string, expectedStatusCode: number) => {
      // Arrange
      // Ignore true functionality of the joinGroups and leaveGroups methods, as we are only testing the enum validation
      serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce([]);
      serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups = vi.fn().mockResolvedValueOnce([]);
      serviceMocks.groupStoreDynamoRepositoryMock.joinGroups = vi.fn().mockResolvedValueOnce([]);
      const mockEventWithEnum = {
        ...mockEvent,
        body: JSON.stringify([
          {
            Namespace: 'travel',
            Group: 'spain',
            Action: enumValue,
          },
        ]),
      };

      // Act
      const result = await handler(mockEventWithEnum, mockContext);

      // Assert
      expect(result.statusCode).toEqual(expectedStatusCode);
    }
  );

  it('should leave groups in the group store dynamo repository when a request has a leave action', async () => {
    // Arrange
    const mockModifyGroupsRequest: IModifyGroups[] = [
      {
        Namespace: 'travel',
        Group: 'spain',
        Subgroup: 'IMMEDIATE',
        Action: GroupActionEnum.LEAVE,
      },
    ];
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce(mockUsersGroups);
    serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups = vi.fn().mockResolvedValueOnce([]);
    serviceMocks.groupStoreDynamoRepositoryMock.joinGroups = vi.fn().mockResolvedValueOnce([]);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups).toHaveBeenCalledWith(
      mockPushID,
      mockModifyGroupsRequest,
      mockUsersGroups
    );
  });

  it('should join groups in the group store dynamo repository when a request has a join action', async () => {
    // Arrange
    const mockModifyGroupsRequest: IModifyGroups[] = [
      {
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'IMMEDIATE',
        Action: GroupActionEnum.JOIN,
      },
    ];
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce(mockUsersGroups);
    serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups = vi.fn().mockResolvedValueOnce(mockUsersGroups);
    serviceMocks.groupStoreDynamoRepositoryMock.joinGroups = vi.fn().mockResolvedValueOnce([
      mockUsersGroups[0],
      {
        GroupID: 'GROUP-02',
        CompositeID: `travel/france/IMMEDIATE`,
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'IMMEDIATE',
      },
    ]);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.groupStoreDynamoRepositoryMock.joinGroups).toHaveBeenCalledWith(
      mockPushID,
      mockModifyGroupsRequest,
      mockUsersGroups
    );
  });

  it('should return a list of users groups once it has left and joined all requested groups', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce(mockUsersGroups);
    serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups = vi.fn().mockResolvedValueOnce([]);
    serviceMocks.groupStoreDynamoRepositoryMock.joinGroups = vi.fn().mockResolvedValueOnce([
      {
        GroupID: 'GROUP-02',
        CompositeID: `travel/france/IMMEDIATE`,
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'IMMEDIATE',
      },
    ]);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups).toHaveBeenCalled();
    expect(serviceMocks.groupStoreDynamoRepositoryMock.joinGroups).toHaveBeenCalled();
    expect(JSON.parse(result.body)).toEqual([
      {
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'IMMEDIATE',
      },
    ]);
  });

  it('should log and return 400 when pushID is missing', async () => {
    // Arrange
    mockMissingIdEvent = {
      ...mockEvent,
      queryStringParameters: {},
    };

    // Act
    const result = await handler(mockMissingIdEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.debug).toHaveBeenCalledWith('pushID has not been provided - returning 400');
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['pushID has not been provided'],
    });
  });

  it('should return 400 when pushID is an empty string', async () => {
    // Arrange
    mockEvent.queryStringParameters = {
      pushID: '',
    };

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
});
