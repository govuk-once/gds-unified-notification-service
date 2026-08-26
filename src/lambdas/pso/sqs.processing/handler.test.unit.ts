import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationStateEnum, ProcessingAdapterError, ServiceMisconfigurationError } from '@common/models';
import { QueueEvent } from '@common/operations';
import { MetricsLabels, ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services';
import {
  BoolParameters,
  iocSpies,
  mockDefaultConfig,
  mockEventContext,
  mockGetParameterImplementation,
  mockQueueEvent,
  mockQueueMultiEvents,
} from '@common/utils';
import { IMessage, mockFailedIMessage, mockIMessage, mockUnidentifiableIMessage } from '@project/lambdas/interfaces';
import { Processing } from '@project/lambdas/pso/sqs.processing/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('Processing QueueHandler', () => {
  let instance: Processing;
  let handler: ReturnType<typeof Processing.prototype.handler>;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test fixtures
  let context: Context;
  let event: QueueEvent<IMessage>;

  const message = mockIMessage();
  const failedMessage = mockFailedIMessage();
  const unidentifiableMessage = mockUnidentifiableIMessage();

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();
    vi.useRealTimers();

    // Test Fixtures
    context = mockEventContext('processing');
    event = mockQueueEvent(message);

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions
    serviceMocks.smConfigurationServiceMock.getParameterAsType = vi.fn().mockResolvedValueOnce({
      SecretString: JSON.stringify({
        apiAccountId: `abc`,
        apiKey: `cde`,
        apiUrl: `efg`,
        consumerRoleArn: `hij`,
        region: `eu-west-2`,
      }),
    });
    serviceMocks.dispatchQueueServiceMock.publishMessage.mockResolvedValue(undefined);
    serviceMocks.notificationsDynamoRepositoryMock.updateRecord.mockResolvedValue(undefined);
    serviceMocks.processingServiceMock.send.mockImplementation(
      async (request: ProcessingAdapterRequest): Promise<ProcessingAdapterResult> => {
        return await Promise.resolve({
          request: request,
          externalUserID: request.userID,
        });
      }
    );

    instance = new Processing(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      notificationsRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      dispatchQueue: serviceMocks.dispatchQueueServiceMock.initialize(),
      processingService: serviceMocks.processingServiceMock.initialize(),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('processing');
  });

  it.each([
    [`false`, `true`, `Service is disabled due to parameter config/common/enabled being set to false`],
    [`true`, `false`, `Service is disabled due to parameter config/processing/enabled being set to false`],
  ])(
    'should obey SSM Enabled flags Common: %s Processing: %s with expect errorMsg: %s',
    async (commonEnabled: string, processingEnabled: string, expectErrorMessage: string) => {
      // Arrange
      const event = mockQueueEvent(message);
      mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
      mockParameterStore[BoolParameters.Config.Processing.Enabled] = processingEnabled;

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(new ServiceMisconfigurationError());
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(expectErrorMessage);
    }
  );

  it('should publish analytics events', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      1,
      {
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        OrganisationID: message.OrganisationID,
      },
      NotificationStateEnum.PROCESSING
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      2,
      {
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        OrganisationID: message.OrganisationID,
      },
      NotificationStateEnum.PROCESSED
    );
  });

  it('should update data in the notifications message table', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);
    const event = mockQueueEvent(message);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        UserID: message.UserID,
        ExternalUserID: message.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
        ProcessedDateTime: date.toISOString(),
      })
    );
  });

  it('should send processed message to the dispatch queue when message is successfully processed.', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: message.DepartmentID,
      MessageBody: message.MessageBody,
      MessageTitle: message.MessageTitle,
      NotificationBody: message.NotificationBody,
      NotificationID: message.NotificationID,
      NotificationTitle: message.NotificationTitle,
      UserID: message.UserID,
      ExternalUserID: message.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
      CampaignID: message.CampaignID,
      OrganisationID: message.OrganisationID,
    });
  });

  it('should processes multiple messages to the dispatch queue when messages are successfully processed.', async () => {
    // Arrange
    const message2: IMessage = {
      ...message,
      NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d2',
      UserID: 'UserID_2',
      NotificationTitle: 'Test message - 002',
      NotificationBody: "You've got a message in the message centre - 2",
    };
    const multiEvent = mockQueueMultiEvents([message, message2]);

    // Act
    await handler(multiEvent, context);

    // Assert
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: message.DepartmentID,
      MessageBody: message.MessageBody,
      MessageTitle: message.MessageTitle,
      NotificationBody: message.NotificationBody,
      NotificationID: message.NotificationID,
      NotificationTitle: message.NotificationTitle,
      UserID: message.UserID,
      ExternalUserID: message.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
      CampaignID: message.CampaignID,
      OrganisationID: message.OrganisationID,
    });
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: message2.DepartmentID,
      MessageBody: message2.MessageBody,
      MessageTitle: message2.MessageTitle,
      NotificationBody: message2.NotificationBody,
      NotificationID: message2.NotificationID,
      NotificationTitle: message2.NotificationTitle,
      UserID: message2.UserID,
      ExternalUserID: message2.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
      CampaignID: message2.CampaignID,
      OrganisationID: message2.OrganisationID,
    });
  });

  it('should return a list of all failed processes when it partial fails.', async () => {
    // Arrange
    const event = mockQueueMultiEvents([message, failedMessage]);

    // Act
    const result = await handler(event, context);

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
    const event = mockQueueMultiEvents([message, failedMessage]);

    // Act
    await handler(event, context);

    // Assert
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.BATCH_ITEM_FAILURES_PROCESSING,
      MetricUnit.Count,
      1
    );
  });

  it('should return and error publish an event when message body is not valid.', async () => {
    // Arrange
    const event = mockQueueEvent(failedMessage);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: failedMessage.NotificationID,
        DepartmentID: failedMessage.DepartmentID,
        CampaignID: failedMessage.CampaignID,
        UserID: failedMessage.UserID,
        OrganisationID: failedMessage.OrganisationID,
      },
      NotificationStateEnum.PROCESSING_FAILED,
      [
        'Invalid input: expected string, received undefined → at NotificationTitle.',
        'Invalid input: expected string, received undefined → at NotificationBody.',
      ]
    );
  });

  it('should return and error and not trigger analytics for unidentifiable events', async () => {
    // Arrange
    const event = mockQueueEvent(unidentifiableMessage);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).not.toHaveBeenCalled();
  });

  it('should log when a message has an invalid NotificationID', async () => {
    // Arrange
    const event = mockQueueEvent(unidentifiableMessage);

    // Act
    const result = handler(event, context);

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

  it('should log when processing adapter call returns success = false.', async () => {
    // Arrange
    const event = mockQueueEvent(message);
    const error = new ProcessingAdapterError(['Mock UDP failure message.']);
    serviceMocks.processingServiceMock.send.mockRejectedValue(error);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(`Error during record handling`, {
      operationId: 'processing',
      error: error.errors,
      identifiableRecord: {
        NotificationID: message.NotificationID,
        DepartmentID: message.DepartmentID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        OrganisationID: failedMessage.OrganisationID,
      },
    });
  });

  it('should log when processing adapter throws an error.', async () => {
    // Arrange
    const event = mockQueueEvent(message);
    const error = new ProcessingAdapterError(['Mock UDP error.']);
    serviceMocks.processingServiceMock.send.mockRejectedValueOnce(error);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(`Error during record handling`, {
      operationId: 'processing',
      error: error.errors,
      identifiableRecord: {
        NotificationID: message.NotificationID,
        DepartmentID: message.DepartmentID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        OrganisationID: failedMessage.OrganisationID,
      },
    });
  });
});
