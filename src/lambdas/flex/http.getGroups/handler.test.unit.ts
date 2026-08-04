import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetGroups } from '@project/lambdas/flex/http.getGroups/handler';
import { IGroups } from '@project/lambdas/interfaces';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetGroups Handler', () => {
  let instance: GetGroups;
  let handler: ReturnType<typeof GetGroups.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  const mockContext = {
    functionName: 'getGroups',
    awsRequestId: '12345',
  } as unknown as Context;

  let mockEvent: EventType;

  const pushID = `abc-cdef-ghi`;
  const mockGroups: IGroups[] = [
    {
      GroupID: '7fdc189d-f2df-4642-bdf2-8ce047fd9250',
      Namespace: 'travel',
      Group: 'france',
      Subgroup: 'IMMEDIATE',
      CompositeID: 'travel/france/IMMEDIATE',
    },
    {
      GroupID: '6e2fa888-aeea-409b-a3cf-bb338e202d94',
      Namespace: 'travel',
      Group: 'spain',
      Subgroup: 'DAILY',
      CompositeID: 'travel/spain/DAILY',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      queryStringParameters: {
        pushID,
      },
    } as unknown as EventType;

    instance = new GetGroups(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      groupStoreDynamoRepository: Promise.resolve(serviceMocks.groupStoreDynamoRepositoryMock),
    }));

    handler = instance.handler();
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue(`mockApiKey`);
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValue(mockGroups);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getGroups');
  });

  it('should return 200 with status ok and return a list of groups', async () => {
    // Arrange
    const responseGroups = [
      {
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'IMMEDIATE',
      },
      {
        Namespace: 'travel',
        Group: 'spain',
        Subgroup: 'DAILY',
      },
    ];

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual(responseGroups);
  });

  it('should return 200 and an empty array when the user has no records', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce([]);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should return a group with just a namespace and group, no subgroup', async () => {
    // Arrange
    const mockGroupsNoSubgroup: IGroups[] = [
      {
        GroupID: '6e2fa888-aeea-409b-a3cf-bb338e202d94',
        Namespace: 'driving',
        Group: 'weather',
        CompositeID: 'driving/weather',
      },
    ];
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce(mockGroupsNoSubgroup);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual([
      {
        Namespace: 'driving',
        Group: 'weather',
      },
    ]);
  });

  it('should return 400 when pushID is undefined', async () => {
    // Arrange
    const mockBadRequestEvent = { ...mockEvent, queryStringParameters: {} };

    // Act
    const result = await handler(mockBadRequestEvent, mockContext);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['PushID has not been provided'],
    });
  });

  it('should return 400 when pushID is an empty string', async () => {
    // Arrange
    const mockBadRequestEvent = { ...mockEvent, queryStringParameters: { pushID: '' } };

    // Act
    const result = await handler(mockBadRequestEvent, mockContext);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['PushID has not been provided'],
    });
  });
});
