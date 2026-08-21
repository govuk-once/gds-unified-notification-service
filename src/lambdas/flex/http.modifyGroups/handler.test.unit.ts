import { mockAPIEvent, mockEventContext } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { ModifyGroups } from '@project/lambdas/flex/http.modifyGroups/handler';
import { GroupActionEnum, mockIGroups, mockIModifyGroups } from '@project/lambdas/interfaces';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('ModifyGroups Handler', () => {
  let instance: ModifyGroups;
  let handler: ReturnType<typeof ModifyGroups.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Test Fixtures
  const context = mockEventContext('modifyGroups');
  const pushID = `5f41e336-c06f-468b-99be-69aa77c1dec7`;
  const usersGroups = mockIGroups();

  beforeEach(() => {
    vi.resetAllMocks();

    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`mockApiKey`);

    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValue([]);
    serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups = vi.fn().mockResolvedValue([]);
    serviceMocks.groupStoreDynamoRepositoryMock.joinGroups = vi.fn().mockResolvedValue([]);

    instance = new ModifyGroups(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      groupStoreDynamoRepository: Promise.resolve(serviceMocks.groupStoreDynamoRepositoryMock),
    }));

    handler = instance.handler();
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
      const messageBody = mockIModifyGroups(enumValue as GroupActionEnum);
      const event = mockAPIEvent(messageBody, { pushID }) as unknown as EventType;

      // Act
      const result = await handler(event, context);

      // Assert
      expect(result.statusCode).toEqual(expectedStatusCode);
    }
  );

  it('should leave groups in the group store dynamo repository when a request has a leave action', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce(usersGroups);

    const messageBody = mockIModifyGroups(GroupActionEnum.LEAVE);
    const event = mockAPIEvent(messageBody, { pushID }) as unknown as EventType;

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups).toHaveBeenCalledWith(
      pushID,
      messageBody,
      usersGroups
    );
  });

  it('should join groups in the group store dynamo repository when a request has a join action', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce(usersGroups);
    serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups = vi.fn().mockResolvedValueOnce(usersGroups);
    serviceMocks.groupStoreDynamoRepositoryMock.joinGroups = vi.fn().mockResolvedValueOnce([
      usersGroups[0],
      {
        GroupID: 'GROUP-02',
        CompositeID: `travel/france/IMMEDIATE`,
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'IMMEDIATE',
      },
    ]);

    const messageBody = mockIModifyGroups(GroupActionEnum.JOIN);
    const event = mockAPIEvent(messageBody, { pushID }) as unknown as EventType;

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.groupStoreDynamoRepositoryMock.joinGroups).toHaveBeenCalledWith(
      pushID,
      messageBody,
      usersGroups
    );
  });

  it('should return a list of users groups once it has left and joined all requested groups', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce(usersGroups);
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

    const messageBody = mockIModifyGroups(GroupActionEnum.JOIN);
    const event = mockAPIEvent(messageBody, { pushID }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

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
    const messageBody = mockIModifyGroups(GroupActionEnum.JOIN);
    const event = mockAPIEvent(messageBody, {}) as unknown as EventType;

    // Act
    const result = await handler(event, context);

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
    const messageBody = mockIModifyGroups(GroupActionEnum.JOIN);
    const event = mockAPIEvent(messageBody, { pushID: '' }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
  });
});
