import { iocSpies, mockEventContext, mockFlexAPIEvent } from '@common/utils';
import { GetGroups } from '@project/lambdas/flex/http.getGroups/handler';
import { IGroups, mockMultipleIGroup } from '@project/lambdas/interfaces';
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

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Test Fixtures
  let context: Context;
  let event: EventType;

  const groups = mockMultipleIGroup();
  const pushID = `abc-cdef-ghi`;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Test Fixtures
    context = mockEventContext('getGroups');
    event = mockFlexAPIEvent({ queryStringParameters: { pushID } }) as unknown as EventType;

    // Mocking successful completion of service functions
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue(`mockApiKey`);
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups.mockResolvedValue(groups);

    instance = new GetGroups(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      groupStoreDynamoRepository: Promise.resolve(serviceMocks.groupStoreDynamoRepositoryMock),
    }));
    handler = instance.handler();
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
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(200);
    expect(JSON.parse(result.body)).toEqual(responseGroups);
  });

  it('should return 200 and an empty array when the user has no records', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValueOnce([]);

    // Act
    const result = await handler(event, context);

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
    const result = await handler(event, context);

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
    const eventWithNoPushID = mockFlexAPIEvent({ pathParameters: {} }) as unknown as EventType;

    // Act
    const result = await handler(eventWithNoPushID, context);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['pushID has not been provided'],
    });
  });

  it('should return 400 when pushID is an empty string', async () => {
    // Arrange
    const eventWithNoPushID = mockFlexAPIEvent({ pathParameters: { pushID: '' } }) as unknown as EventType;

    // Act
    const result = await handler(eventWithNoPushID, context);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['pushID has not been provided'],
    });
  });
});
