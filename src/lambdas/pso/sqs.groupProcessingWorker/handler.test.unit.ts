import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationStateEnum } from '@common/models';
import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { QueueEvent } from '@common/operations';
import { IMessageRecord } from '@common/repositories';
import { MetricsLabels } from '@common/services';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IGroupMessageMetadata, IProcessedMessage } from '@project/lambdas/interfaces';
import { GroupProcessingWorker } from '@project/lambdas/pso/sqs.groupProcessingWorker/handler';
import { Context } from 'aws-lambda';

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
  const serviceMocks = ServiceSpies(observabilityMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Data presets
  const mockContext = {
    functionName: 'groupProcessingWorker',
    awsRequestId: '12345',
  } as unknown as Context;

  const mockGroupMessageMetadataBody: IGroupMessageMetadata = {
    GroupMessage: {
      GroupNotificationID: 'GRP_01',
      Namespace: 'travel',
      Group: 'france',
      Subgroup: 'immediate',
      CampaignID: 'CAM_ID',
      OrganisationID: 'ORG01',
      NotificationTitle: 'Hey',
      NotificationBody: "You've got a message in the message centre",
      MessageTitle: 'Hi there',
      MessageBody: 'MOCK_LONG_MESSAGE',
    },
    GroupNotificationID: 'GRP_01',
    WorkerID: 0,
    CacheKey: 'Worker/GroupProcessingWorker/GRP_01/0',
    APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    ReceivedDateTime: '2026-01-01T12:00:00.000Z',
    ValidatedDateTime: '2026-01-01T12:00:00.300Z',
  };

  const mockEvent: QueueEvent<IGroupMessageMetadata> = {
    Records: [
      {
        messageId: 'mockMessageId_1',
        receiptHandle: 'mockReceiptHandle',
        attributes: {
          ApproximateReceiveCount: '2',
          SentTimestamp: '202601021513',
          SenderId: 'mockSenderId',
          ApproximateFirstReceiveTimestamp: '202601021513',
        },
        messageAttributes: {},
        md5OfBody: 'mockMd5OfBody',
        md5OfMessageAttributes: 'mockMd5OfMessageAttributes',
        eventSource: 'aws:sqs',
        eventSourceARN: 'mockEventSourceARN',
        awsRegion: 'eu-west2',
        body: mockGroupMessageMetadataBody,
      },
    ],
  };

  const mockPartialFailedEvent = {
    Records: [
      {
        ...mockEvent.Records[0],
        messageId: 'mockMessageId_1',
      },
      {
        ...mockEvent.Records[0],
        messageId: 'mockMessageId_2',
        body: {
          ...mockGroupMessageMetadataBody,
          GroupMessage: {
            GroupNotificationID: 'GRP_01',
            Namespace: 'travel',
            Group: 'france',
            Subgroup: 'immediate',
            CampaignID: 'CAM_ID',
            OrganisationID: 'ORG01',
            // Missed out on purpose NotificationTitle, NotificationBody
          },
          CacheKey: 'Worker/GroupProcessingWorker/GRP_01/1',
        },
      },
    ],
  } as unknown as QueueEvent<IGroupMessageMetadata>;

  const mockFailedEvent = {
    Records: [
      {
        ...mockEvent.Records[0],
        messageId: 'mockMessageId_1',
        body: {
          ...mockGroupMessageMetadataBody,
          GroupMessage: {
            GroupNotificationID: 'GRP_01',
            Namespace: 'travel',
            Group: 'france',
            Subgroup: 'immediate',
            CampaignID: 'CAM_ID',
            OrganisationID: 'ORG01',
            // Missed out on purpose NotificationTitle, NotificationBody
          },
        },
      },
    ],
  } as unknown as QueueEvent<IGroupMessageMetadata>;

  const mockUnidentifiableEvent = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          ...mockGroupMessageMetadataBody,
          GroupNotificationID: undefined,
          GroupMessage: {
            // Missed out on purpose GroupNotificationID
            Namespace: 'travel',
            Group: 'france',
            Subgroup: 'immediate',
            CampaignID: 'CAM_ID',
            OrganisationID: 'ORG01',
          },
        },
      },
    ],
  } as unknown as QueueEvent<IGroupMessageMetadata>;

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
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_1']);
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
      mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
      mockParameterStore[BoolParameters.Config.GroupProcessingWorker.Enabled] = processingEnabled;

      // Act
      const result = handler(mockEvent, mockContext);

      // Assert
      await expect(result).rejects.toThrow(new ServiceMisconfigurationError());
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(expectErrorMessage);
    }
  );

  it('creates a batch of message using the pushID, checksum NotificationID, message body, and metadata, then sends it to the dispatch queue', async () => {
    // Arrange
    const notificationID = '524ef10e-aef1-4c51-a0e0-343f499f7201';
    const expectedProcessedMessage: IProcessedMessage = {
      NotificationID: notificationID,
      CampaignID: 'CAM_ID',
      OrganisationID: 'ORG01',
      ExternalUserID: 'pushID_1',
      NotificationTitle: 'Hey',
      NotificationBody: "You've got a message in the message centre",
      MessageTitle: 'Hi there',
      MessageBody: 'MOCK_LONG_MESSAGE',
    };

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.dispatchQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([expectedProcessedMessage]);
  });

  it('updates the cache with an empty array when all pushIDs are processed', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith('Worker/GroupProcessingWorker/GRP_01/0', []);
  });

  it('updates the cache with any unprocessed pushIDs after splitting the array', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getNumericParameter.mockResolvedValueOnce(1); // Simulate worker batch size of 1
    serviceMocks.cacheServiceMock.get.mockReset();
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_1', 'pushID_2']);
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_2']);

    // Act
    await handler(mockEvent, mockContext);

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
    const notificationID = '524ef10e-aef1-4c51-a0e0-343f499f7201';
    const expectedProcessedMessage: IMessageRecord = {
      NotificationID: notificationID,
      CampaignID: 'CAM_ID',
      OrganisationID: 'ORG01',
      ExternalUserID: 'pushID_1',
      NotificationTitle: 'Hey',
      NotificationBody: "You've got a message in the message centre",
      MessageTitle: 'Hi there',
      MessageBody: 'MOCK_LONG_MESSAGE',
      Events: [],
      APIGWExtendedID: mockGroupMessageMetadataBody.APIGWExtendedID,
      ReceivedDateTime: mockGroupMessageMetadataBody.ReceivedDateTime,
      ValidatedDateTime: mockGroupMessageMetadataBody.ValidatedDateTime,
      ProcessedDateTime: expect.any(String),
    };

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      expectedProcessedMessage,
    ]);
  });

  it('creates an analytics event when a group message is successfully processed', async () => {
    // Arrange
    const notificationID = '524ef10e-aef1-4c51-a0e0-343f499f7201';
    const expectedProcessedMessage: IProcessedMessage = {
      NotificationID: notificationID,
      CampaignID: 'CAM_ID',
      OrganisationID: 'ORG01',
      ExternalUserID: 'pushID_1',
      NotificationTitle: 'Hey',
      NotificationBody: "You've got a message in the message centre",
      MessageTitle: 'Hi there',
      MessageBody: 'MOCK_LONG_MESSAGE',
    };

    // Act
    await handler(mockEvent, mockContext);

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
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_1', 'pushID_2']);
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(['pushID_2']);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessage).toHaveBeenCalledWith(
      mockGroupMessageMetadataBody
    );
  });

  it('does not create a new message to group processing worker if all pushIDs are processed', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.groupProcessingQueueServiceMock.publishMessage).not.toHaveBeenCalled();
  });

  it('throws an error if the cache is misconfigured and does not return a list of pushIDs', async () => {
    // Arrange
    serviceMocks.cacheServiceMock.get.mockReset();
    serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(undefined);

    // Act
    const result = handler(mockEvent, mockContext);

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
    // Act
    const result = await handler(mockPartialFailedEvent, mockContext);

    // Assert
    expect(result).toEqual({
      batchItemFailures: [
        {
          itemIdentifier: 'mockMessageId_2',
        },
      ],
    });
  });

  it('should add a metric for the number of failed processes for a partial failure.', async () => {
    // Act
    await handler(mockPartialFailedEvent, mockContext);

    // Assert
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.BATCH_ITEM_FAILURES_GROUP_PROCESSING,
      MetricUnit.Count,
      1
    );
  });

  it('should throw an error when the full batch fails to be processed.', async () => {
    // Act
    const result = handler(mockFailedEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should throw an when the event is unidentifiable', async () => {
    // Act
    const result = handler(mockUnidentifiableEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should log when a message has an invalid GroupNotificationID', async () => {
    // Act
    const result = handler(mockUnidentifiableEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain required record fields, rejecting record`,
      expect.objectContaining({
        error: expect.stringContaining('body.GroupNotificationID'),
        raw: mockUnidentifiableEvent.Records[0].body,
      })
    );
  });

  it('should make a record using expire in days if given in payload', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);
    const mockEventWithExpireInDays = {
      Records: [
        {
          ...mockEvent.Records[0],
          body: {
            ...mockGroupMessageMetadataBody,
            GroupMessage: { ...mockGroupMessageMetadataBody.GroupMessage, ExpiresInDays: 25 },
          },
        },
      ],
    };

    // Act
    await handler(mockEventWithExpireInDays, mockContext);

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
        APIGWExtendedID: mockGroupMessageMetadataBody.APIGWExtendedID,
        ReceivedDateTime: mockGroupMessageMetadataBody.ReceivedDateTime,
        ProcessedDateTime: date.toISOString(),
        ValidatedDateTime: mockGroupMessageMetadataBody.ValidatedDateTime,
        RequestedDaysToExpire: 25,
        Events: [],
      },
    ]);
  });
});
