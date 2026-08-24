import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationStateEnum } from '@common/models';
import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { mockIMessageRecord } from '@common/repositories';
import { MetricsLabels } from '@common/services';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { mockEventContext, mockQueueEvent, mockQueueMultiEvents } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import {
  IGroupMessageMetadata,
  mockIFailedGroupMessageMetadata,
  mockIGroupMessageMetadata,
  mockIProcessedGroupMessage,
  mockIUnidentifiableGroupMessageMetadata,
} from '@project/lambdas/interfaces';
import { GroupProcessingWorker } from '@project/lambdas/pso/sqs.groupProcessingWorker/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

describe('GroupProcessingWorker QueueHandler', () => {
  let instance: GroupProcessingWorker;
  let handler: ReturnType<typeof GroupProcessingWorker.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Data presets
  const context = mockEventContext('groupProcessingWorker');
  const messageBody = mockIGroupMessageMetadata();
  const failedMessageBody = mockIFailedGroupMessageMetadata();
  const unidentifiableMessageBody = mockIUnidentifiableGroupMessageMetadata();
  const pushID_1 = 'pushID_1';

  beforeEach(async () => {
    // Reset all mocks
    vi.resetAllMocks();
    vi.useRealTimers();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.dispatchQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);
    serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch.mockResolvedValue(undefined);
    serviceMocks.groupProcessingQueueServiceMock.publishMessage.mockResolvedValue(undefined);

    serviceMocks.cacheServiceMock.store.mockResolvedValue(undefined);
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce([pushID_1]);
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce([]);

    await serviceMocks.analyticsQueueServiceMock.initialize();
    instance = new GroupProcessingWorker(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      cacheService: Promise.resolve(serviceMocks.cacheServiceMock),
      dispatchQueue: serviceMocks.dispatchQueueServiceMock.initialize(),
      groupProcessingQueue: serviceMocks.groupProcessingQueueServiceMock.initialize(),
      notificationsRepository: serviceMocks.notificationsDynamoRepositoryMock.initialize(),
    }));

    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('groupProcessingWorker');
  });

  it.each([
    [`false`, `true`, `Service is disabled due to parameter config/common/enabled being set to false`],
    [`true`, `false`, `Service is disabled due to parameter config/groupProcessingWorker/enabled being set to false`],
  ])(
    'should obey SSM Enabled flags Common: %s Processing: %s with expect errorMsg: %s',
    async (commonEnabled: string, processingEnabled: string, expectErrorMessage: string) => {
      // Arrange
      const event = mockQueueEvent(messageBody);
      mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
      mockParameterStore[BoolParameters.Config.GroupProcessingWorker.Enabled] = processingEnabled;

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(new ServiceMisconfigurationError());
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(expectErrorMessage);
    }
  );

  it('creates a batch of message using the pushID, checksum NotificationID, message body, and metadata, then sends it to the dispatch queue', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    const expectedProcessedMessage = mockIProcessedGroupMessage(messageBody, pushID_1);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.dispatchQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([expectedProcessedMessage]);
  });

  it('updates the cache with an empty array when all pushIDs are processed', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith('Worker/GroupProcessingWorker/GRP_01/0', []);
  });

  it('updates the cache with any unprocessed pushIDs after splitting the array', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    serviceMocks.configurationServiceMock.getNumericParameter.mockResolvedValueOnce(1); // Simulate worker batch size of 1
    serviceMocks.cacheServiceMock.get.mockReset();
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_1', 'pushID_2']);
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_2']);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith('Worker/GroupProcessingWorker/GRP_01/0', [
      'pushID_2',
    ]);
    expect(observabilityMocks.logger.debug).toHaveBeenCalledWith(
      `CacheKey and the amount unprocessed pushIDs to send to group processing queue`,
      {
        cacheKey: 'Worker/GroupProcessingWorker/GRP_01/0',
        batchLength: 1,
      }
    );
  });

  it('creates records in the notification dynamo db with a checksum of the fields as the NotificationID for the processed messages', async () => {
    // Arrange
    vi.useRealTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:02.000Z'));
    const event = mockQueueEvent(messageBody);
    const processedMessage = mockIProcessedGroupMessage(messageBody, pushID_1);
    const expectedMessageRecord = mockIMessageRecord(processedMessage, {
      APIGWExtendedID: true,
      ReceivedDateTime: true,
      ValidatedDateTime: true,
      ProcessedDateTime: true,
    });

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      expectedMessageRecord,
    ]);
  });

  it('creates an analytics event when a group message is successfully processed', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    const expectedProcessedMessage = mockIProcessedGroupMessage(messageBody, pushID_1);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [expectedProcessedMessage],
      NotificationStateEnum.PROCESSED
    );
  });

  it('creates a new message to group processing worker if any pushIDs are unprocessed', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getNumericParameter.mockResolvedValueOnce(1); // Simulate worker batch size of 1
    serviceMocks.cacheServiceMock.get.mockReset();
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_0', 'pushID_1']);
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_2']);

    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessage).toHaveBeenCalledWith(messageBody);
  });

  it('does not create a new message to group processing worker if all pushIDs are processed', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessage).not.toHaveBeenCalled();
  });

  it('throws an error if the cache is misconfigured and does not return a list of pushIDs', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    serviceMocks.cacheServiceMock.get.mockReset();
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(undefined);

    // Act
    const result = handler(event, context);

    // Assert

    await expect(result).rejects.toThrow(
      new FullBatchFailureError([
        new ServiceMisconfigurationError([
          'List of pushIDs store in elasticache are misconfigured',
          'CacheKey: Worker/GroupProcessingWorker/GRP_01/0',
        ]),
      ])
    );
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
      MetricsLabels.BATCH_ITEM_FAILURES_GROUP_PROCESSING,
      MetricUnit.Count,
      1
    );
  });

  it('should throw an error when the full batch fails to be processed.', async () => {
    // Arrange
    const event = mockQueueEvent(failedMessageBody);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should throw an when the event is unidentifiable', async () => {
    // Arrange
    const event = mockQueueEvent(unidentifiableMessageBody);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should log when a message has an invalid GroupNotificationID', async () => {
    // Arrange
    const event = mockQueueEvent(unidentifiableMessageBody);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain required record fields, rejecting record`,
      expect.objectContaining({
        error: expect.stringContaining('body.GroupNotificationID'),
        raw: unidentifiableMessageBody,
      })
    );
  });

  it('should make a record using expire in days if given in payload', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);
    const messageBodyWithExpiresInDay: IGroupMessageMetadata = {
      ...messageBody,
      GroupMessage: {
        ...messageBody.GroupMessage,
        ExpiresInDays: 25,
      },
    };
    const event = mockQueueEvent(messageBodyWithExpiresInDay);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      {
        NotificationID: '524ef10e-aef1-4c51-a0e0-343f499f7201',
        CampaignID: 'CAM_ID',
        OrganisationID: 'ORG01',
        ExternalUserID: 'pushID_1',
        NotificationTitle: 'Hey',
        NotificationBody: "You've got a message in the message centre",
        MessageTitle: 'Hi there',
        MessageBody: 'MOCK_LONG_MESSAGE',
        APIGWExtendedID: messageBody.APIGWExtendedID,
        ReceivedDateTime: messageBody.ReceivedDateTime,
        ProcessedDateTime: date.toISOString(),
        ValidatedDateTime: messageBody.ValidatedDateTime,
        RequestedDaysToExpire: 25,
        Events: [],
      },
    ]);
  });
});
