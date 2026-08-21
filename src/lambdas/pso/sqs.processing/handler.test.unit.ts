import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ProcessingAdapterError } from '@common/models/Errors/BadGatewayError';
import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { MetricsLabels } from '@common/services';
import { ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services/interfaces';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { mockEventContext, mockQueueEvent, mockQueueMultiEvents } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import {
  IMessage,
  mockFailedIMessage,
  mockIMessage,
  mockUnidentifiableIMessage,
} from '@project/lambdas/interfaces/IMessage';
import { Processing } from '@project/lambdas/pso/sqs.processing/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

describe('Processing QueueHandler', () => {
  let instance: Processing;
  let handler: ReturnType<typeof Processing.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test fixtures
  const context = mockEventContext('processing');
  const messageBody = mockIMessage();
  const failedMessageBody = mockFailedIMessage();
  const unidentifiableMessageBody = mockUnidentifiableIMessage();

  beforeEach(async () => {
    // Reset all mocks
    vi.resetAllMocks();
    vi.useRealTimers();
    serviceMocks.smConfigurationServiceMock.getParameterAsType = vi.fn().mockResolvedValueOnce({
      SecretString: JSON.stringify({
        apiAccountId: `abc`,
        apiKey: `cde`,
        apiUrl: `efg`,
        consumerRoleArn: `hij`,
        region: `eu-west-2`,
      }),
    });

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions]
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

    await serviceMocks.analyticsQueueServiceMock.initialize();
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
      const event = mockQueueEvent(messageBody);
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
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      1,
      {
        DepartmentID: messageBody.DepartmentID,
        NotificationID: messageBody.NotificationID,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        OrganisationID: messageBody.OrganisationID,
      },
      NotificationStateEnum.PROCESSING
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      2,
      {
        DepartmentID: messageBody.DepartmentID,
        NotificationID: messageBody.NotificationID,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        OrganisationID: messageBody.OrganisationID,
      },
      NotificationStateEnum.PROCESSED
    );
  });

  it('should update data in the notifications message table', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        DepartmentID: messageBody.DepartmentID,
        NotificationID: messageBody.NotificationID,
        UserID: messageBody.UserID,
        ExternalUserID: messageBody.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
        ProcessedDateTime: date.toISOString(),
      })
    );
  });

  it('should send processed message to the dispatch queue when message is successfully processed.', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: messageBody.DepartmentID,
      MessageBody: messageBody.MessageBody,
      MessageTitle: messageBody.MessageTitle,
      NotificationBody: messageBody.NotificationBody,
      NotificationID: messageBody.NotificationID,
      NotificationTitle: messageBody.NotificationTitle,
      UserID: messageBody.UserID,
      ExternalUserID: messageBody.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
      CampaignID: messageBody.CampaignID,
      OrganisationID: messageBody.OrganisationID,
    });
  });

  it('should processes multiple messages to the dispatch queue when messages are successfully processed.', async () => {
    // Arrange
    const messageBody2: IMessage = {
      ...messageBody,
      NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d2',
      UserID: 'UserID_2',
      NotificationTitle: 'Test message - 002',
      NotificationBody: "You've got a message in the message centre - 2",
    };
    const multiEvent = mockQueueMultiEvents([messageBody, messageBody2]);

    // Act
    await handler(multiEvent, context);

    // Assert
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: messageBody.DepartmentID,
      MessageBody: messageBody.MessageBody,
      MessageTitle: messageBody.MessageTitle,
      NotificationBody: messageBody.NotificationBody,
      NotificationID: messageBody.NotificationID,
      NotificationTitle: messageBody.NotificationTitle,
      UserID: messageBody.UserID,
      ExternalUserID: messageBody.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
      CampaignID: messageBody.CampaignID,
      OrganisationID: messageBody.OrganisationID,
    });
    expect(serviceMocks.dispatchQueueServiceMock.publishMessage).toHaveBeenCalledWith({
      DepartmentID: messageBody2.DepartmentID,
      MessageBody: messageBody2.MessageBody,
      MessageTitle: messageBody2.MessageTitle,
      NotificationBody: messageBody2.NotificationBody,
      NotificationID: messageBody2.NotificationID,
      NotificationTitle: messageBody2.NotificationTitle,
      UserID: messageBody2.UserID,
      ExternalUserID: messageBody2.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
      CampaignID: messageBody2.CampaignID,
      OrganisationID: messageBody2.OrganisationID,
    });
  });

  it('should return a list of all failed processes when it partial fails.', async () => {
    // Arrange
    const event = mockQueueMultiEvents([messageBody, failedMessageBody]);

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
    const event = mockQueueMultiEvents([messageBody, failedMessageBody]);

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
    const event = mockQueueEvent(failedMessageBody);

    // Act
    const result = handler(event, context);

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
      NotificationStateEnum.PROCESSING_FAILED,
      [
        'Invalid input: expected string, received undefined → at body.NotificationTitle.',
        'Invalid input: expected string, received undefined → at body.NotificationBody.',
      ]
    );
  });

  it('should return and error and not trigger analytics for unidentifiable events', async () => {
    // Arrange
    const event = mockQueueEvent(unidentifiableMessageBody);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).not.toHaveBeenCalled();
  });

  it('should log when a message has an invalid NotificationID', async () => {
    // Arrange
    const event = mockQueueEvent(unidentifiableMessageBody);

    // Act
    const result = handler(event, context);

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

  it('should log when processing adapter call returns success = false.', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
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
        NotificationID: messageBody.NotificationID,
        DepartmentID: messageBody.DepartmentID,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        OrganisationID: failedMessageBody.OrganisationID,
      },
    });
  });

  it('should log when processing adapter throws an error.', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
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
        NotificationID: messageBody.NotificationID,
        DepartmentID: messageBody.DepartmentID,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        OrganisationID: failedMessageBody.OrganisationID,
      },
    });
  });
});
