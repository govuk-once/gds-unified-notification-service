import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationStateEnum, ServiceMisconfigurationError, SimulatedError } from '@common/models';
import { QueueEvent } from '@common/operations';
import { MetricsLabels } from '@common/services';
import { IMessage } from '@project/lambdas/interfaces';
import { Validation } from '@project/lambdas/pso/sqs.validation/handler';
import SSMParameters from '@shared/ssmParameter';
import {
  iocSpies,
  mockDefaultConfig,
  mockEventContext,
  mockFailedIMessage,
  mockIMessage,
  mockQueueEvent,
  mockQueueMultiEvents,
  mockServicesExpectedBehaviour,
  mockUnidentifiableIMessage,
} from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('Validation QueueHandler', async () => {
  let instance: Validation;
  let handler: ReturnType<typeof Validation.prototype.handler>;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = await iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test fixtures
  let context: Context;
  let event: QueueEvent<Omit<IMessage, 'OrganisationID'>>;

  const message = {
    ...mockIMessage(),
    OrganisationID: undefined,
  };
  const organisationID = 'mockSender';
  const failedMessage = {
    ...mockFailedIMessage(),
    OrganisationID: undefined,
  };
  const unidentifiableMessage = mockUnidentifiableIMessage();

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();
    vi.useRealTimers();

    // Test Fixtures
    context = mockEventContext('validation');
    event = mockQueueEvent(message);

    // Mock SSM store and services responses
    const { resetMockParameterStore } = mockServicesExpectedBehaviour(serviceMocks);
    mockParameterStore = resetMockParameterStore;

    instance = new Validation(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      notificationsRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      organisationsRepository: Promise.resolve(serviceMocks.organisationsDynamoRepositoryMock),
      processingQueue: Promise.resolve(serviceMocks.processingQueueServiceMock),
      validationService: Promise.resolve(serviceMocks.validationServiceMock),
    }));
    handler = instance.handler();

    serviceMocks.organisationsDynamoRepositoryMock.getRecord.mockResolvedValueOnce({
      DisplayName: 'TestOrganisation',
      OrganisationID: 'mockSender',
      OrganisationConfig: {
        MessageRetention: {
          Allowed: false,
        },
      },
    });
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('validation');
  });

  it.each([
    [false, true, `Service is disabled due to parameter config/common/enabled being set to false`],
    [true, false, `Service is disabled due to parameter config/validation/enabled being set to false`],
  ])(
    'should obey SSM Enabled flags Common: %s Processing: %s with expect errorMsg: %s',
    async (commonEnabled: boolean, validationEnabled: boolean, expectErrorMessage: string) => {
      // Arrange
      const event = mockQueueEvent(message);
      mockParameterStore[SSMParameters.Config.Common.Enabled.Path] = commonEnabled;
      mockParameterStore[SSMParameters.Config.Validation.Enabled.Path] = validationEnabled;

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(new ServiceMisconfigurationError());
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(expectErrorMessage);
    }
  );

  it('should stamp OrganisationID from the senderId attribute and send it to processing queue', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      ...message,
      OrganisationID: 'mockSender',
    });
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({ OrganisationID: organisationID })
    );
  });

  it('should send an analytics event when the message is validated', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        //OrganisationID: organisationID,
      },
      NotificationStateEnum.VALIDATING
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        //OrganisationID: organisationID,
      },
      NotificationStateEnum.VALIDATED
    );
  });

  it('should create a message record  when the message is validated', async () => {
    // Arrange
    vi.useFakeTimers();
    const validateDatetime = new Date();
    vi.setSystemTime(validateDatetime);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecord).toHaveBeenCalledWith({
      ...message,
      OrganisationID: 'mockSender',
      ReceivedDateTime: event.Records[0].attributes.ApproximateFirstReceiveTimestamp,
      ValidatedDateTime: validateDatetime.toISOString(),
      Events: [],
    });
  });

  it('should log when the handler fails to parse the message body.', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Failed parsing JSON within SQS Body', {
      raw: event.Records[0].body,
    });
  });

  it('should throw an error when the message title equals "FAIL_AT_VALIDATION".', async () => {
    // Arrange
    const messageWithFailTrigger = {
      ...message,
      NotificationTitle: 'FAIL_AT_VALIDATION',
    };
    const event = mockQueueEvent(messageWithFailTrigger);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(new SimulatedError(['Simulating an error!']));
  });

  it('should validate messages with valid markdown', async () => {
    // Arrange
    const messageWithMarkdown = {
      ...message,
      MessageBody:
        'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
    };
    const event = mockQueueEvent(messageWithMarkdown);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: messageWithMarkdown.DepartmentID,
        NotificationID: messageWithMarkdown.NotificationID,
        UserID: messageWithMarkdown.UserID,
        CampaignID: messageWithMarkdown.CampaignID,
        //OrganisationID: organisationID,
      },
      NotificationStateEnum.VALIDATED
    );
  });

  it('should reject messages that contain invalid markdown', async () => {
    // Arrange
    const invalidMarkdownBody = {
      ...message,
      MessageBody: '# Heading\n\nThis is a [link](https://example.com) with an unapproved hostname.',
    };
    const event = mockQueueEvent(invalidMarkdownBody);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        //OrganisationID: organisationID,
      },
      NotificationStateEnum.VALIDATION_FAILED,
      ['https://example.com is using example.com hostname which is not on the allow list']
    );
  });

  it('should return a list of all failed processes when it partial fails.', async () => {
    // Arrange
    const partialFailedEvent = mockQueueMultiEvents([message, failedMessage]);

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
    const partialFailedEvent = mockQueueMultiEvents([message, failedMessage]);

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
    const failedEvent = mockQueueEvent(failedMessage);

    // Act
    const result = handler(failedEvent, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: failedMessage.NotificationID,
        DepartmentID: failedMessage.DepartmentID,
        CampaignID: failedMessage.CampaignID,
        UserID: failedMessage.UserID,
        //OrganisationID: failedMessage.OrganisationID,
      },
      NotificationStateEnum.VALIDATING
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: failedMessage.NotificationID,
        DepartmentID: failedMessage.DepartmentID,
        UserID: failedMessage.UserID,
        CampaignID: failedMessage.CampaignID,
        //OrganisationID: failedMessage.OrganisationID,
      },
      NotificationStateEnum.VALIDATION_FAILED,
      [
        'Invalid input: expected string, received undefined → at NotificationTitle.',
        'Invalid input: expected string, received undefined → at NotificationBody.',
      ]
    );
  });

  it('should return an error and log when a message has an invalid NotificationID', async () => {
    // Arrange
    const unidentifiableEvent = mockQueueEvent(unidentifiableMessage);

    // Act
    const result = instance.handler()(unidentifiableEvent, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain required record fields, rejecting record`,
      expect.objectContaining({
        error: expect.stringContaining('NotificationID'),
        raw: unidentifiableMessage,
      })
    );
  });

  it('should return an error and reject message with unknown deeplinks', async () => {
    // Arrange
    const bodyWithBadDeeplink = { ...message, MessageBody: 'https://example.com' };
    const event = mockQueueEvent(bodyWithBadDeeplink);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: message.NotificationID,
        DepartmentID: message.DepartmentID,
        CampaignID: message.CampaignID,
        UserID: message.UserID,
        //OrganisationID: organisationID,
      },
      'VALIDATION_FAILED',
      [`https://example.com is using example.com hostname which is not on the allow list`]
    );
  });
});
