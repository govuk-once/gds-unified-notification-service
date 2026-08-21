import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ServiceMisconfigurationError, SimulatedError } from '@common/models/Errors/InternalServerError';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { MetricsLabels } from '@common/services';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { mockEventContext, mockQueueEvent, mockQueueMultiEvents } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { mockFailedIMessage, mockIMessage, mockUnidentifiableIMessage } from '@project/lambdas/interfaces/IMessage';
import { Validation } from '@project/lambdas/pso/sqs.validation/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

describe('Validation QueueHandler', () => {
  let instance: Validation;
  let handler: ReturnType<typeof Validation.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test fixtures
  const messageBody = mockIMessage();
  const failedMessageBody = mockFailedIMessage();
  const unidentifiableMessageBody = mockUnidentifiableIMessage();
  const context = mockEventContext('validation');

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValue(undefined);
    serviceMocks.notificationsDynamoRepositoryMock.createRecord.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);

    instance = new Validation(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      contentValidationService: Promise.resolve(serviceMocks.contentValidationServiceMock),
      notificationsRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      processingQueue: serviceMocks.processingQueueServiceMock.initialize(),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('validation');
  });

  it('should log when the handler is called and when it completes successfully.', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Request received`, { event });
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Request completed`);
  });

  it('should log when the handler fails to parse the message body.', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Failed parsing JSON within SQS Body', {
      raw: event.Records[0].body,
    });
  });

  it('should throw an error when the message title equals "FAIL_AT_VALIDATION".', async () => {
    // Arrange
    const messageBodyWithFailTrigger = {
      ...messageBody,
      NotificationTitle: 'FAIL_AT_VALIDATION',
    };
    const event = mockQueueEvent(messageBodyWithFailTrigger);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(new SimulatedError(['Simulating an error!']));
  });

  it.each([
    [`false`, `true`, `Service is disabled due to parameter config/common/enabled being set to false`],
    [`true`, `false`, `Service is disabled due to parameter config/validation/enabled being set to false`],
  ])(
    'should obey SSM Enabled flags Common: %s Processing: %s with expect errorMsg: %s',
    async (commonEnabled: string, validationEnabled: string, expectErrorMessage: string) => {
      // Arrange
      const event = mockQueueEvent(messageBody);
      mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
      mockParameterStore[BoolParameters.Config.Validation.Enabled] = validationEnabled;

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(new ServiceMisconfigurationError());
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(expectErrorMessage);
    }
  );

  it('should publish analytics events when lambda beings validating record.', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: messageBody.DepartmentID,
        NotificationID: messageBody.NotificationID,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        OrganisationID: messageBody.OrganisationID,
      },
      NotificationStateEnum.VALIDATING
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: messageBody.DepartmentID,
        MessageBody: messageBody.MessageBody,
        MessageTitle: messageBody.MessageTitle,
        NotificationBody: messageBody.NotificationBody,
        NotificationID: messageBody.NotificationID,
        NotificationTitle: messageBody.NotificationTitle,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        OrganisationID: messageBody.OrganisationID,
      },
      NotificationStateEnum.VALIDATED
    );
  });

  it('should send a message to processing queue', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessage).toHaveBeenCalledWith(messageBody);
  });

  it('should store data in the notifications message table', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        ...messageBody,
        ReceivedDateTime: '202601021513',
      })
    );
  });

  it('should validate messages with valid markdown.', async () => {
    // Arrange
    const messageBodyWithMarkdown = {
      ...messageBody,
      MessageBody:
        'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
    };
    const event = mockQueueEvent(messageBodyWithMarkdown);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: messageBodyWithMarkdown.DepartmentID,
        MessageBody: messageBodyWithMarkdown.MessageBody,
        MessageTitle: messageBodyWithMarkdown.MessageTitle,
        NotificationBody: messageBodyWithMarkdown.NotificationBody,
        NotificationID: messageBodyWithMarkdown.NotificationID,
        NotificationTitle: messageBodyWithMarkdown.NotificationTitle,
        UserID: messageBodyWithMarkdown.UserID,
        CampaignID: messageBodyWithMarkdown.CampaignID,
        OrganisationID: messageBodyWithMarkdown.OrganisationID,
      },
      NotificationStateEnum.VALIDATED
    );
  });

  it('should reject messages that contain invalid markdown.', async () => {
    // Arrange
    const invalidMarkdownBody = {
      ...messageBody,
      MessageBody: '# Heading\n\nThis is a [link](https://example.com) with an unapproved hostname.',
    };
    const event = mockQueueEvent(invalidMarkdownBody);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: messageBody.DepartmentID,
        NotificationID: messageBody.NotificationID,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        OrganisationID: messageBody.OrganisationID,
      },
      NotificationStateEnum.VALIDATION_FAILED,
      ['https://example.com is using example.com hostname which is not on the allow list → at body.MessageBody.']
    );
  });

  it('should return a list of all failed processes when it partial fails.', async () => {
    // Arrange
    const partialFailedEvent = mockQueueMultiEvents([messageBody, failedMessageBody]);

    // Act
    const result = await handler(partialFailedEvent, context);

    // Assert
    expect(result).toEqual({
      batchItemFailures: [
        {
          itemIdentifier: 'mockMessageId_1',
        },
      ],
    });
  });

  it('should add a metric for the number of failed processes for a partial failure.', async () => {
    // Arrange
    const partialFailedEvent = mockQueueMultiEvents([messageBody, failedMessageBody]);

    // Act
    await handler(partialFailedEvent, context);

    // Assert
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.BATCH_ITEM_FAILURES_VALIDATION,
      MetricUnit.Count,
      1
    );
  });

  it('should return and error and trigger analytics for failed events', async () => {
    // Arrange
    const failedEvent = mockQueueEvent(failedMessageBody);

    // Act
    const result = handler(failedEvent, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: failedMessageBody.NotificationID,
        DepartmentID: failedMessageBody.DepartmentID,
        CampaignID: failedMessageBody.CampaignID,
        UserID: failedMessageBody.UserID,
        OrganisationID: failedMessageBody.OrganisationID,
      },
      NotificationStateEnum.VALIDATING
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: failedMessageBody.NotificationID,
        DepartmentID: failedMessageBody.DepartmentID,
        UserID: failedMessageBody.UserID,
        CampaignID: failedMessageBody.CampaignID,
        OrganisationID: failedMessageBody.OrganisationID,
      },
      NotificationStateEnum.VALIDATION_FAILED,
      [
        'Invalid input: expected string, received undefined → at body.NotificationTitle.',
        'Invalid input: expected string, received undefined → at body.NotificationBody.',
      ]
    );
  });

  it('should return an error and log when a message has an invalid NotificationID', async () => {
    // Arrange
    const unidentifiableEvent = mockQueueEvent(unidentifiableMessageBody);

    // Act
    const result = instance.handler()(unidentifiableEvent, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain required record fields, rejecting record`,
      expect.objectContaining({
        error: expect.stringContaining('body.NotificationID'),
        raw: unidentifiableMessageBody,
      })
    );
  });

  it('should return an error and reject message with unknown deeplinks', async () => {
    // Arrange
    const bodyWithBadDeeplink = { ...messageBody, MessageBody: 'https://example.com' };
    const event = mockQueueEvent(bodyWithBadDeeplink);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: messageBody.NotificationID,
        DepartmentID: messageBody.DepartmentID,
        CampaignID: messageBody.CampaignID,
        UserID: messageBody.UserID,
        OrganisationID: messageBody.OrganisationID,
      },
      'VALIDATION_FAILED',
      [`https://example.com is using example.com hostname which is not on the allow list → at body.MessageBody.`]
    );
  });
});
