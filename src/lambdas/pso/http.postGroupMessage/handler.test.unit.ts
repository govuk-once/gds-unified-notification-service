import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { PostGroupMessage } from '@project/lambdas/pso/http.postGroupMessage/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PostGroupMessage Handler', () => {
  let instance: PostGroupMessage;
  let handler: ReturnType<typeof PostGroupMessage.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Mock Message Body
  const mockGroupMessage = {
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'immediate',
    GroupNotificationID: 'TO_GROUP_ID',
    CampaignID: 'CAM_ID',
    MessageTitle: 'You have a new Message',
    MessageBody: 'Open Notification Centre to read your notifications',
    NotificationTitle: 'You have a new Notification',
    NotificationBody: 'Here is the Notification body.',
  };

  // Mock AWS Lambda Context
  const mockContext = {
    functionName: 'postGroupMessage',
    awsRequestId: '12345',
  } as unknown as Context;

  // Mock the event
  let mockEvent: EventType;

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    mockEvent = {
      body: JSON.stringify([mockGroupMessage]),
      headers: {
        'x-api-key': 'mockApiKey',
        'Content-Type': `application/json`,
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        authorizer: { Organization: 'ORG01' },
      },
    } as unknown as EventType;

    // Mocking retrieving store apiKey
    instance = new PostGroupMessage(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      contentValidationService: Promise.resolve(serviceMocks.contentValidationServiceMock),
      groupStoreDynamoRepository: Promise.resolve(serviceMocks.groupStoreDynamoRepositoryMock),
    }));
    handler = instance.handler();

    const mockPushID = '57d7fb1a-f069-46cf-af16-6ebdc599a679';
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup = vi.fn().mockResolvedValueOnce([mockPushID]);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postGroupMessage');
  });

  it('should return 400 when mTLS certificate does not resolve an organisation', async () => {
    // Arrange
    const noAuthorizedEvent = {
      ...mockEvent,
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
    } as unknown as EventType;

    // Act
    const result = await handler(noAuthorizedEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).not.toHaveBeenCalled();
  });

  it('should return a status 202 and list of GroupNotificationID and the number of users it is sent to.', async () => {
    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: mockGroupMessage.GroupNotificationID, UsersInGroup: 1 },
    ]);
  });

  it('should return a status 202 and list of GroupNotificationID and the number of users being 0 if there are no users in a group.', async () => {
    // Arrange
    serviceMocks.groupStoreDynamoRepositoryMock.getUsersInGroup = vi.fn().mockResolvedValueOnce([]);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: mockGroupMessage.GroupNotificationID, UsersInGroup: 0 },
    ]);
  });

  it('should NOT throw an error when called with a group message containing deeplink that is on the allowlist', async () => {
    // Act
    const result = await handler(
      {
        ...mockEvent,
        body: JSON.stringify([{ ...mockGroupMessage, MessageBody: 'https://readme.gov.uk/hello-world?q=1' }]),
      },
      mockContext
    );

    // Assert
    expect(result.statusCode).toEqual(202);
  });

  it('should throw an error when called with a message containing deeplink that is not on the allowlist', async () => {
    // Act
    const result = await handler(
      { ...mockEvent, body: JSON.stringify([{ ...mockGroupMessage, MessageBody: 'https://example.com' }]) },
      mockContext
    );

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['https://example.com is using example.com hostname which is not on the allow list'],
    });
  });

  it('should validate messages that contain valid markdown.', async () => {
    // Arrange
    const mockMarkdownMessage = {
      ...mockGroupMessage,
      MessageBody:
        'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
    };
    const mockEventWithMarkdown = {
      ...mockEvent,
      body: JSON.stringify([mockMarkdownMessage]),
    };

    // Act
    const result = await handler(mockEventWithMarkdown, mockContext);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([
      { GroupNotificationID: mockGroupMessage.GroupNotificationID, UsersInGroup: 1 },
    ]);
  });

  it('should reject messages that contain invalid markdown.', async () => {
    // Arrange
    const mockInvalidMarkdownMessage = {
      ...mockGroupMessage,
      MessageBody: '    const x = 10;\n    const y = 20;',
    };
    const mockEventInvalidMarkdown = {
      ...mockEvent,
      body: JSON.stringify([mockInvalidMarkdownMessage]),
    };

    // Act
    const result = await handler(mockEventInvalidMarkdown, mockContext);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['Message body contains markdown elements which are not valid: code_block'],
    });
  });
});
