import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
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
import { mockIMessage_NoOrgID } from '@project/lambdas/interfaces';
import { PostMessage } from '@project/lambdas/pso/http.postMessage/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('PostMessage Handler', () => {
  let instance: PostMessage;
  let handler: ReturnType<typeof PostMessage.prototype.handler>;
  type EventType = Parameters<typeof handler>[0];

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test fixtures
  const context = mockEventContext('postMessage');
  const messageBody = mockIMessage_NoOrgID();

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
    instance = new PostMessage(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      contentValidationService: Promise.resolve(serviceMocks.contentValidationServiceMock),
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      processingQueue: serviceMocks.processingQueueServiceMock.initialize(),
    }));
    handler = instance.handler();

    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);
    serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch.mockResolvedValue(undefined);
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('postMessage');
  });

  it('should send messages to processing queue.', async () => {
    // Arrange
    const event = mockAPIEvent({ body: [messageBody] }) as unknown as EventType;

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
      { ...messageBody, OrganisationID: 'ORG01' },
    ]);
  });

  it('should stamp OrganisationID from the mTLS cert onto queued, recorded and analytics messages', async () => {
    // Arrange
    const event = mockAPIEvent({ body: [messageBody] }) as unknown as EventType;

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
      { ...messageBody, OrganisationID: event.requestContext.authorizer!.Organization },
    ]);
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [
        {
          ...messageBody,
          OrganisationID: event.requestContext.authorizer!.Organization,
          APIGWExtendedID: event.requestContext.requestId,
        },
      ],
      NotificationStateEnum.VALIDATED_API_CALL
    );
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({ OrganisationID: event.requestContext.authorizer!.Organization }),
    ]);
  });

  it('should return 400 when mTLS certificate does not resolve an organisation', async () => {
    // Arrange
    const event = mockUnauthorizedAPIEvent([messageBody]) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).not.toHaveBeenCalled();
  });

  it('should make a record of notifications messages', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);
    const event = mockAPIEvent({ body: [messageBody] }) as unknown as EventType;

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      {
        ...messageBody,
        OrganisationID: 'ORG01',
        APIGWExtendedID: event.requestContext.requestId,
        ReceivedDateTime: new Date(event.requestContext.requestTimeEpoch).toISOString(),
        ValidatedDateTime: date.toISOString(),
        Events: [],
      },
    ]);
  });

  it('should make a record using expire in days if given in payload', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);
    const messageBodyWithExpiresInDay = { ...messageBody, ExpiresInDays: 25 };
    const event = mockAPIEventWithMessageRetention([messageBodyWithExpiresInDay]) as unknown as EventType;

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      {
        ...messageBody,
        OrganisationID: 'ORG01',
        APIGWExtendedID: event.requestContext.requestId,
        ReceivedDateTime: new Date(event.requestContext.requestTimeEpoch).toISOString(),
        ValidatedDateTime: date.toISOString(),
        RequestedDaysToExpire: 25,
        Events: [],
      },
    ]);
  });

  it('should reject any notification where the ExpiresInDays is a negative', async () => {
    // Arrange
    const messageBodyWithInvalidExpiresInDays = {
      ...messageBody,
      ExpiresInDays: -1,
    };
    const event = mockAPIEvent({ body: [messageBodyWithInvalidExpiresInDays] }) as unknown as EventType;

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
    const messageBodyWithInvalidExpiresInDays = {
      ...messageBody,
      ExpiresInDays: 0.5,
    };
    const event = mockAPIEvent({ body: [messageBodyWithInvalidExpiresInDays] }) as unknown as EventType;
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

  it('should send VALIDATED_API_CALL event to analytics queue.', async () => {
    // Arrange
    const event = mockAPIEvent({ body: [messageBody] }) as unknown as EventType;

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [{ ...messageBody, OrganisationID: 'ORG01', APIGWExtendedID: event.requestContext.requestId }],
      NotificationStateEnum.VALIDATED_API_CALL
    );
  });

  it('should return a status 202 and list of NotificationIDs when call is successful.', async () => {
    // Arrange
    const event = mockAPIEvent({ body: [messageBody] }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([{ NotificationID: messageBody.NotificationID }]);
  });

  it('should NOT throw an error when called with a message containing deeplink that is on the allowlist', async () => {
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

  it('should validate messages that contain valid markdown.', async () => {
    // Arrange
    const mockMarkdownMessageBody = {
      ...messageBody,
      MessageBody:
        'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
    };
    const event = mockAPIEvent({ body: [mockMarkdownMessageBody] }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(202);
    expect(JSON.parse(result.body)).toEqual([{ NotificationID: messageBody.NotificationID }]);
  });

  it('should reject messages that contain invalid markdown.', async () => {
    // Arrange
    const mockInvalidMarkdownMessageBody = {
      ...messageBody,
      MessageBody: '    const x = 10;\n    const y = 20;',
    };
    const event = mockAPIEvent({ body: [mockInvalidMarkdownMessageBody] }) as unknown as EventType;

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
