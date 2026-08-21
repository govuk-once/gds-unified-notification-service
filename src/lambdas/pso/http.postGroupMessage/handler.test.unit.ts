import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import {
  mockAPIEvent,
  mockAPIEventWithMessageRetention,
  mockEventContext,
  mockUnauthorizedAPIEvent,
} from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { mockIGroupMessage } from '@project/lambdas/interfaces';
import { PostGroupMessage } from '@project/lambdas/pso/http.postGroupMessage/handler';
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

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test Fixtures
  const context = mockEventContext('postGroupMessage');
  const messageBody = mockIGroupMessage();
  const mockPushID = '57d7fb1a-f069-46cf-af16-6ebdc599a679';

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking retrieving store apiKey
    instance = new PostGroupMessage(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      contentValidationService: Promise.resolve(serviceMocks.contentValidationServiceMock),
      cacheService: Promise.resolve(serviceMocks.cacheServiceMock),
      groupStoreDynamoRepository: Promise.resolve(serviceMocks.groupStoreDynamoRepositoryMock),
      groupProcessingQueue: Promise.resolve(serviceMocks.groupProcessingQueueServiceMock),
    }));
    handler = instance.handler();

    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup = vi.fn().mockResolvedValue([mockPushID]);
    serviceMocks.cacheServiceMock.store.mockResolvedValue(undefined);
    serviceMocks.cacheServiceMock.get.mockResolvedValue([mockPushID]);
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    vi.mocked(uuid as () => string)
      .mockReset()
      .mockReturnValueOnce(mockGroupNotificationID);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postGroupMessage');
  });

  it('should return 400 when mTLS certificate does not resolve an organisation', async () => {
    // Arrange
    const event = mockUnauthorizedAPIEvent(messageBody) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).not.toHaveBeenCalled();
  });

  it('should return a status 202 and list of GroupNotificationID with the number of users it is sent to', async () => {
    // Arrange
    const event = mockAPIEvent({ body: [messageBody] }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: messageBody.GroupNotificationID, UsersInGroup: 1 },
    ]);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessageBatch).toHaveBeenCalledTimes(1);
  });

  it('should return a status 202 and generate a GroupNotificationID if none is provided', async () => {
    // Arrange
    const event = mockAPIEvent({ body: [{ ...messageBody, GroupNotificationID: undefined }] }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([{ GroupNotificationID: mockGroupNotificationID, UsersInGroup: 1 }]);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessageBatch).toHaveBeenCalledTimes(1);
  });

  it('should return a status 202 and list of GroupNotificationID with the number of users it is sent to for multiple messages.', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup = vi
      .fn()
      .mockResolvedValueOnce([mockPushID])
      .mockResolvedValueOnce([mockPushID]);
    const GroupNotificationID_2 = 'To_Group_2';
    const event = mockAPIEvent({
      body: [messageBody, { ...messageBody, GroupNotificationID: GroupNotificationID_2, Group: 'spain' }],
    }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: messageBody.GroupNotificationID, UsersInGroup: 1 },
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
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup = vi
      .fn()
      .mockResolvedValueOnce(['push_1', 'push_2', 'push_3', 'push_4', 'push_5', 'push_6']);
    serviceMocks.cacheServiceMock.get
      .mockResolvedValueOnce(chunk_1)
      .mockResolvedValueOnce(chunk_2)
      .mockResolvedValueOnce(chunk_3)
      .mockResolvedValueOnce(chunk_4)
      .mockResolvedValueOnce(chunk_5);

    const event = mockAPIEvent({ body: [messageBody] }) as unknown as EventType;

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      1,
      `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/0`,
      chunk_1
    );
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      2,
      `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/1`,
      chunk_2
    );
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      3,
      `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/2`,
      chunk_3
    );
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      4,
      `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/3`,
      chunk_4
    );
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenNthCalledWith(
      5,
      `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/4`,
      chunk_5
    );
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessageBatch).toHaveBeenLastCalledWith([
      {
        GroupMessage: { ...messageBody, OrganisationID: 'ORG01' },
        GroupNotificationID: messageBody.GroupNotificationID,
        WorkerID: 0,
        CacheKey: `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/0`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
      {
        GroupMessage: { ...messageBody, OrganisationID: 'ORG01' },
        GroupNotificationID: messageBody.GroupNotificationID,
        WorkerID: 1,
        CacheKey: `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/1`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
      {
        GroupMessage: { ...messageBody, OrganisationID: 'ORG01' },
        GroupNotificationID: messageBody.GroupNotificationID,
        WorkerID: 2,
        CacheKey: `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/2`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
      {
        GroupMessage: { ...messageBody, OrganisationID: 'ORG01' },
        GroupNotificationID: messageBody.GroupNotificationID,
        WorkerID: 3,
        CacheKey: `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/3`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
      {
        GroupMessage: { ...messageBody, OrganisationID: 'ORG01' },
        GroupNotificationID: messageBody.GroupNotificationID,
        WorkerID: 4,
        CacheKey: `Worker/GroupProcessingWorker/${messageBody.GroupNotificationID}/4`,
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        ReceivedDateTime: new Date(1428582896000).toISOString(),
        ValidatedDateTime: '2026-01-01T12:30:00.000Z',
      },
    ]);
  });

  it('should return a status 202 and response, as well as not storing anything in cache when there are no users in the group', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup = vi.fn().mockResolvedValueOnce([]);
    const event = mockAPIEvent({ body: [messageBody] }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: messageBody.GroupNotificationID, UsersInGroup: 0 },
    ]);
    expect(serviceMocks.cacheServiceMock.store).not.toHaveBeenCalled();
  });

  it('should NOT throw an error when called with a group message containing deeplink that is on the allowlist', async () => {
    // Arrange
    const event = mockAPIEvent({
      body: [
        {
          ...messageBody,
          MessageBody: 'https://readme.gov.uk/hello-world?q=1',
        },
      ],
    }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
  });

  it('should throw an error when called with a message containing deeplink that is not on the allowlist', async () => {
    // Arrange
    const event = mockAPIEvent({
      body: [{ ...messageBody, MessageBody: 'https://example.com' }],
    }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['https://example.com is using example.com hostname which is not on the allow list'],
    });
  });

  it('should validate messages that contain valid markdown', async () => {
    // Arrange
    const mockMarkdownMessage = {
      ...messageBody,
      MessageBody:
        'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
    };
    const event = mockAPIEvent({ body: [mockMarkdownMessage] }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: messageBody.GroupNotificationID, UsersInGroup: 1 },
    ]);
  });

  it('should reject messages that contain invalid markdown', async () => {
    // Arrange
    const mockInvalidMarkdownMessage = {
      ...messageBody,
      MessageBody: '    const x = 10;\n    const y = 20;',
    };
    const event = mockAPIEvent({ body: [mockInvalidMarkdownMessage] }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['Message body contains markdown elements which are not valid: code_block'],
    });
  });

  it('should throw an error when called with a message containing deeplink and deeplinkUrl feature is disabled', async () => {
    // Arrange
    mockParameterStore[BoolParameters.Config.FeatureFlags.DeepLinkUrl] = 'false';
    const event = mockAPIEvent({
      body: [{ ...messageBody, DeeplinkURL: 'https://example.com' }],
    }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['Invalid input: unexpected DeeplinkURL at .'],
    });
  });

  it('should reject any notification where the ExpiresInDays is a negative', async () => {
    // Arrange
    const event = mockAPIEventWithMessageRetention([{ ...messageBody, ExpiresInDays: -1 }]) as unknown as EventType;

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
    const event = mockAPIEventWithMessageRetention([{ ...messageBody, ExpiresInDays: 0.5 }]) as unknown as EventType;

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

  it('should throw an error when called with a message containing ExpiresInDays when message retention feature is disabled', async () => {
    // Arrange
    mockParameterStore[BoolParameters.Config.FeatureFlags.MessageRetention] = 'false';
    const event = mockAPIEvent({ body: [{ ...messageBody, ExpiresInDays: 25 }] }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['Invalid input: unexpected ExpiresInDays at .'],
    });
  });
});
