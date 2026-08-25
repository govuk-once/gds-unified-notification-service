import { ChannelsEnum } from '@common/models';
import {
  iocSpies,
  mockAPIPostMessageEvent,
  mockDefaultConfig,
  mockEventContext,
  mockGetParameterImplementation,
  mockPsoAPIEventWithChannelsControl,
  mockUnauthorizedPsoAPIEvent,
} from '@common/utils';
import { mockIGroupMessage } from '@project/lambdas/interfaces';
import { PostGroupMessage } from '@project/lambdas/pso/http.postGroupMessage/handler';
import { Context } from 'aws-lambda';
import { v4 as uuid } from 'uuid';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

const { mockGroupNotificationID } = vi.hoisted(() => {
  return { mockGroupNotificationID: 'GENERATED_GROUP_ID' };
});
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

describe('PostGroupMessage Handler', () => {
  let instance: PostGroupMessage;
  let handler: ReturnType<typeof PostGroupMessage.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test Fixtures
  let context: Context;
  let event: EventType;

  const groupMessage = mockIGroupMessage();
  const mockPushID = '57d7fb1a-f069-46cf-af16-6ebdc599a679';

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Test Fixtures
    context = mockEventContext('postGroupMessage');
    event = mockAPIPostMessageEvent([groupMessage]) as unknown as EventType;

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup.mockResolvedValue([mockPushID]);
    serviceMocks.cacheServiceMock.store.mockResolvedValue(undefined);
    serviceMocks.cacheServiceMock.get.mockResolvedValue([mockPushID]);
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    vi.mocked(uuid as () => string)
      .mockReset()
      .mockReturnValueOnce(mockGroupNotificationID);

    instance = new PostGroupMessage(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      cacheService: Promise.resolve(serviceMocks.cacheServiceMock),
      groupStoreDynamoRepository: Promise.resolve(serviceMocks.groupStoreDynamoRepositoryMock),
      groupProcessingQueue: Promise.resolve(serviceMocks.groupProcessingQueueServiceMock),
      validationService: Promise.resolve(serviceMocks.validationServiceMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postGroupMessage');
  });

  it('should return 400 when mTLS certificate does not resolve an organisation', async () => {
    // Arrange
    const event = mockUnauthorizedPsoAPIEvent(groupMessage) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).not.toHaveBeenCalled();
  });

  it('should return a status 202 and list of GroupNotificationID with the number of users it is sent to', async () => {
    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: groupMessage.GroupNotificationID, UsersInGroup: 1 },
    ]);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessageBatch).toHaveBeenCalledTimes(1);
  });

  it('should return a status 202 and generate a GroupNotificationID if none is provided', async () => {
    // Arrange
    const groupMessageWithGroupNotificationID = {
      ...groupMessage,
      GroupNotificationID: undefined,
    };
    const eventWithGroupNotificationID = mockAPIPostMessageEvent([
      groupMessageWithGroupNotificationID,
    ]) as unknown as EventType;

    // Act
    const result = await handler(eventWithGroupNotificationID, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([{ GroupNotificationID: mockGroupNotificationID, UsersInGroup: 1 }]);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessageBatch).toHaveBeenCalledTimes(1);
  });

  it('should return a status 202 and list of GroupNotificationID with the number of users it is sent to for multiple messages.', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup
      .mockResolvedValueOnce([mockPushID])
      .mockResolvedValueOnce([mockPushID]);
    const GroupNotificationID_2 = 'To_Group_2';
    const event = mockAPIPostMessageEvent([
      groupMessage,
      { ...groupMessage, GroupNotificationID: GroupNotificationID_2, Group: 'spain' },
    ]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: groupMessage.GroupNotificationID, UsersInGroup: 1 },
      { GroupNotificationID: GroupNotificationID_2, UsersInGroup: 1 },
    ]);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(2);
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessageBatch).toHaveBeenCalledTimes(2);
  });

  it('should split pushIDs into chunks based on worker number, add elasticache keys for each chunk, and send the chunks in a batch message with the group message.', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date('2026-01-01T12:30:00Z');
    vi.setSystemTime(date);

    const chunk_1 = ['push_1', 'push_2'];
    const chunk_2 = ['push_3'];
    const chunk_3 = ['push_4'];
    const chunk_4 = ['push_5'];
    const chunk_5 = ['push_6'];
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup.mockResolvedValueOnce([
      'push_1',
      'push_2',
      'push_3',
      'push_4',
      'push_5',
      'push_6',
    ]);
    serviceMocks.cacheServiceMock.get
      .mockResolvedValueOnce(chunk_1)
      .mockResolvedValueOnce(chunk_2)
      .mockResolvedValueOnce(chunk_3)
      .mockResolvedValueOnce(chunk_4)
      .mockResolvedValueOnce(chunk_5);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      1,
      `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/0`,
      chunk_1
    );
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      2,
      `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/1`,
      chunk_2
    );
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      3,
      `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/2`,
      chunk_3
    );
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      4,
      `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/3`,
      chunk_4
    );
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      5,
      `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/4`,
      chunk_5
    );
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessageBatch).toHaveBeenLastCalledWith([
      {
        GroupMessage: { ...groupMessage, OrganisationID: 'ORG01' },
        GroupNotificationID: groupMessage.GroupNotificationID,
        WorkerID: 0,
        CacheKey: `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/0`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
      {
        GroupMessage: { ...groupMessage, OrganisationID: 'ORG01' },
        GroupNotificationID: groupMessage.GroupNotificationID,
        WorkerID: 1,
        CacheKey: `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/1`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
      {
        GroupMessage: { ...groupMessage, OrganisationID: 'ORG01' },
        GroupNotificationID: groupMessage.GroupNotificationID,
        WorkerID: 2,
        CacheKey: `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/2`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
      {
        GroupMessage: { ...groupMessage, OrganisationID: 'ORG01' },
        GroupNotificationID: groupMessage.GroupNotificationID,
        WorkerID: 3,
        CacheKey: `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/3`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
      {
        GroupMessage: { ...groupMessage, OrganisationID: 'ORG01' },
        GroupNotificationID: groupMessage.GroupNotificationID,
        WorkerID: 4,
        CacheKey: `Worker/GroupProcessingWorker/${groupMessage.GroupNotificationID}/4`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
    ]);
  });

  it('should return a status 202 and response, as well as not storing anything in cache when there are no users in the group', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup.mockResolvedValueOnce([]);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: groupMessage.GroupNotificationID, UsersInGroup: 0 },
    ]);
    expect(serviceMocks.cacheServiceMock.store).not.toHaveBeenCalled();
  });

  it('should accept a group message with Channel set to PUSH_NOTIFICATION_AND_MESSAGE_CENTRE', async () => {
    // Arrange
    const messageWithChannel = {
      ...groupMessage,
      Channel: ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
    };
    const eventWithChannel = mockPsoAPIEventWithChannelsControl([messageWithChannel]) as unknown as EventType;

    // Act
    const result = await handler(eventWithChannel, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: groupMessage.GroupNotificationID, UsersInGroup: 1 },
    ]);
  });

  it('should accept a group message with Channel set to MESSAGE_CENTRE_ONLY', async () => {
    // Arrange
    const messageWithChannel = {
      ...groupMessage,
      Channel: ChannelsEnum.MESSAGE_CENTRE_ONLY,
    };
    const event = mockPsoAPIEventWithChannelsControl([messageWithChannel]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: messageWithChannel.GroupNotificationID, UsersInGroup: 1 },
    ]);
  });

  it('should accept a group message when Channel is omitted', async () => {
    // Arrange
    const event = mockPsoAPIEventWithChannelsControl([groupMessage]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
  });

  it('should return 400 when Channel is an empty string', async () => {
    // Arrange
    const messageWithEmptyChannel = {
      ...groupMessage,
      Channel: '',
    };
    const event = mockPsoAPIEventWithChannelsControl([messageWithEmptyChannel]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: [
        'Invalid option: expected one of \"PUSH_NOTIFICATION_AND_MESSAGE_CENTRE\"|\"MESSAGE_CENTRE_ONLY\" → at 0.Channel.',
      ],
    });
  });

  it('should return 400 when Channel is an invalid enum value', async () => {
    // Arrange
    const messageWithInvalidChannel = {
      ...groupMessage,
      Channel: 'INVALID_CHANNEL',
    };
    const event = mockPsoAPIEventWithChannelsControl([messageWithInvalidChannel]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: [
        'Invalid option: expected one of \"PUSH_NOTIFICATION_AND_MESSAGE_CENTRE\"|\"MESSAGE_CENTRE_ONLY\" → at 0.Channel.',
      ],
    });
  });

  it('should return 400 when Channel is a lowercase variant of a valid enum', async () => {
    // Arrange
    const messageWithLowercaseChannel = {
      ...groupMessage,
      Channel: 'push_notification_and_message_centre',
    };
    const event = mockPsoAPIEventWithChannelsControl([messageWithLowercaseChannel]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: [
        'Invalid option: expected one of \"PUSH_NOTIFICATION_AND_MESSAGE_CENTRE\"|\"MESSAGE_CENTRE_ONLY\" → at 0.Channel.',
      ],
    });
  });

  it('should reject any notification where the ExpiresInDays is a negative', async () => {
    // Arrange
    const event = mockPsoAPIEventWithChannelsControl([{ ...groupMessage, ExpiresInDays: -1 }]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          Status: 400,
          HttpError: 'BadRequest',
          Errors: ['Too small: expected number to be >0 → at 0.ExpiresInDays.'],
        }),
        statusCode: 400,
      })
    );
  });

  it('should reject any notification where the ExpiresInDays is a float', async () => {
    // Arrange
    const event = mockPsoAPIEventWithChannelsControl([{ ...groupMessage, ExpiresInDays: 0.5 }]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          Status: 400,
          HttpError: 'BadRequest',
          Errors: ['Invalid input: expected int, received number → at 0.ExpiresInDays.'],
        }),
        statusCode: 400,
      })
    );
  });
});
