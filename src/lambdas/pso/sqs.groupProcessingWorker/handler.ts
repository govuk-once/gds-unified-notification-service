import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetDispatchQueueService,
  iocGetGroupProcessingQueueService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { NotificationStateEnum } from '@common/models';
import { InternalServerError } from '@common/models/Errors/InternalServerError';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  CacheService,
  ConfigurationService,
  DispatchQueueService,
  MetricsLabels,
  ObservabilityService,
} from '@common/services';
import { GroupProcessingQueueService } from '@common/services/groupProcessingQueueService';
import { BoolParameters, NumericParameters } from '@common/utils';
import { generateNotificationIDForGroupMessage } from '@common/utils/checksumString';
import {
  IGroupMessageMetadataSchema,
  IIdentifiableGroupMessageSchema,
  IProcessedMessage,
} from '@project/lambdas/interfaces';
import { SQSRecord } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = IGroupMessageMetadataSchema;
const identifiableRecordSchema = z.object({
  GroupMessage: IIdentifiableGroupMessageSchema,
  GroupNotificationID: z.string(),
});

/**
 * 
 * Lambda handling processing of group messages
 * - Validates input 
 * - Retrieves pushIDs of users in batch from elasticache
 * - Builds message template using the group message and the pushIDs
 * - Pushes group messages into dispatch queue
 * - Requeues any unprocessed pushIDs
 * 
 * Sample event:
{
  "Records": [
    {
      "messageId": "mockMessageId",
      "receiptHandle": "mockReceiptHandle",
      "body": "{\n\"GroupMessage\": {\n    \"Namespace\": \"namespace\",\n    \"Group\": \"group\",\n    \"Subgroup\": \"subgroup\",\n    \"GroupNotificationID\": \"1234\",\n    \"OrganisationID\": \"ORG_01\",\n    \"NotificationTitle\": \"Travel Alert Update\",\n    \"NotificationBody\": \"You have a new message in the message center.\",\n    \"MessageTitle\": \"MOCK_LONG_TITLE\",\n    \"MessageBody\": \"MOCK_LONG_MESSAGE\"\n  },\n\"GroupNotificationID\": \"1234\",\n\"WorkerID\": 0,\n\"CacheKey\": \"Worker/GroupProcessingWorker/1234/0\",\n\"APIGWExtendedID\": \"requestId\",\n\"ReceivedDateTime\": \"2026-08-01T:12:00:00.000Z\",\n\"ValidatedDateTime\": \"2026-08-01T:12:00:00.600Z\"\n}",
      "attributes": {
        "ApproximateReceiveCount": "2",
        "SentTimestamp": "202601021513",
        "SenderId": "mockSenderId",
        "ApproximateFirstReceiveTimestamp": "202601021513"
      },
      "messageAttributes": {},
      "md5OfBody": "{{{md5_of_body}}}",
      "eventSource": "aws:sqs",
      "eventSourceARN": "arn:aws:sqs:us-east-1:123456789012:MyQueue",
      "awsRegion": "eu-west-2"
    }
  ]
}
 */
export class GroupProcessingWorker extends BatchQueueOperation<
  typeof requestBodySchema,
  typeof identifiableRecordSchema
> {
  public operationId: string = 'groupProcessingWorker';
  protected enableConfig: string = BoolParameters.Config.GroupProcessingWorker.Enabled;

  public readonly requestBodySchema = requestBodySchema;
  public readonly identifiableRecordSchema = identifiableRecordSchema;

  public readonly analyticsService!: AnalyticsService;
  public readonly cacheService!: CacheService;
  public readonly dispatchQueue!: DispatchQueueService;
  public readonly groupProcessingQueue!: GroupProcessingQueueService;
  public readonly notificationsRepository!: NotificationsDynamoRepository;

  constructor(
    public config: ConfigurationService,
    observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<GroupProcessingWorker>
  ) {
    super(config, observability);
    this.injectDependencies(dependencies);
  }

  public recordHandler = async (record: SQSRecord): Promise<void> => {
    // Validate Incoming Group Messages
    const data = await this.validateRecord(record);

    const groupMessage = data.body.GroupMessage;
    const cacheKey = data.body.CacheKey;
    const workerBatchSize = await this.config.getNumericParameter(NumericParameters.Group.Dispatch.WorkerBatchSize);

    // Retrieve pushIDs from cache
    this.observability.logger.debug(`Retrieving list of pushIDs to process from cache.`);
    const unprocessedPushIDs = await this.cacheService.get<string[]>(cacheKey);
    if (!unprocessedPushIDs) {
      throw new InternalServerError([
        'List of pushIDs store in elasticache are misconfigured',
        `CacheKey: ${cacheKey}`,
      ]);
    }

    this.observability.logger.debug(`Splicing list of pushIDs to a max size of worker batch size.`);
    const pushIDs = unprocessedPushIDs.splice(0, workerBatchSize);
    this.observability.logger.debug('The amount of pushIDs to be processed in this batch', {
      pushIDsLength: pushIDs.length,
    });

    // Updating cache with unprocessed pushIDs and verifying it has been updated
    await this.cacheService.store(cacheKey, unprocessedPushIDs);
    const elasticacheValue = await this.cacheService.get<string[]>(cacheKey);
    this.observability.logger.debug(`CacheKey and the amount unprocessed pushIDs to send to group processing queue`, {
      cacheKey,
      batchLength: elasticacheValue?.length,
    });

    // Build group messages to users -
    const processedMessages: IProcessedMessage[] = [];
    for (const pushID of pushIDs) {
      const notificationID = generateNotificationIDForGroupMessage(pushID, groupMessage);
      processedMessages.push({
        NotificationID: notificationID,
        OrganisationID: groupMessage.OrganisationID,
        ExternalUserID: pushID,
        CampaignID: groupMessage.CampaignID,
        NotificationTitle: groupMessage.NotificationTitle,
        NotificationBody: groupMessage.NotificationBody,
        MessageTitle: groupMessage.MessageTitle,
        MessageBody: groupMessage.MessageBody,
      });
    }

    // Add record of group notifications to message table
    this.observability.logger.debug(`Adding record of notification to message table`);
    await this.notificationsRepository.createRecordBatch(
      processedMessages.map((body) => ({
        ...body,
        APIGWExtendedID: data.body.APIGWExtendedID,
        ReceivedDateTime: data.body.ReceivedDateTime,
        ValidatedDateTime: data.body.ValidatedDateTime,
        ProcessedDateTime: new Date().toISOString(),
        Events: [],
      }))
    );

    // Create analytics event for successful processing of group message
    this.observability.logger.debug('Creating analytics events for each processed message');
    await this.analyticsService.publishMultipleEvents(processedMessages, NotificationStateEnum.PROCESSED);

    // Push processed messages to Dispatch queue
    this.observability.logger.info('Successful processed batch of pushIDs, sending to dispatch queue');
    await this.dispatchQueue.publishMessageBatch(processedMessages);

    // Requeue if any pushIDs are unprocessed
    if (unprocessedPushIDs.length > 0) {
      this.observability.logger.debug('Requeue unprocessed pushIDs', {
        cacheKey,
        LengthPushIDs: unprocessedPushIDs.length,
      });
      await this.groupProcessingQueue.publishMessage(data.body);
    }
  };

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async onStart(): Promise<void> {
    this.observability.metrics.addMetric(MetricsLabels.GROUP_PROCESSING_WORKER_STARTED, MetricUnit.Count, 1);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async onError(): Promise<void> {
    this.observability.metrics.addMetric(MetricsLabels.GROUP_PROCESSING_WORKER_FAILED, MetricUnit.Count, 1);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async onSuccess(): Promise<void> {
    this.observability.metrics.addMetric(MetricsLabels.GROUP_PROCESSING_WORKER_COMPLETED, MetricUnit.Count, 1);
  }

  protected batchItemFailureMetric(batchItemFailuresCount: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.BATCH_ITEM_FAILURES_GROUP_PROCESSING,
      MetricUnit.Count,
      batchItemFailuresCount
    );
  }
}

// IoC
export const handler = new GroupProcessingWorker(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsService: iocGetAnalyticsService(),
  cacheService: iocGetCacheService().connect(),
  dispatchQueue: iocGetDispatchQueueService(),
  groupProcessingQueue: iocGetGroupProcessingQueueService(),
  notificationsRepository: iocGetNotificationDynamoRepository(),
})).handler();
