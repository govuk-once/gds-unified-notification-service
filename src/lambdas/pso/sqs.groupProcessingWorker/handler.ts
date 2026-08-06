import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetDispatchQueueService,
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
import { NumericParameters } from '@common/utils';
import { IGroupMessageMetadataSchema } from '@project/lambdas/interfaces';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import { SQSRecord } from 'aws-lambda';
import { v4 as uuid } from 'uuid';

const requestBodySchema = IGroupMessageMetadataSchema;

/**
 * 
 * Lambda handling processing of group messages
 * - Validates input 
 * - Retrieves pushIDs of users in batch from elasticache
 * - Builds message template using the group message and the pushIDs
 * - Pushes group messages into dispatch queue
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
export class GroupProcessingWorker extends BatchQueueOperation<typeof requestBodySchema> {
  public operationId: string = 'groupProcessingWorker';
  public requestBodySchema = requestBodySchema;
  //protected enableConfig: string = BoolParameters.Config.GroupProcessingWorker.Enabled;

  public readonly analyticsService!: AnalyticsService;
  public readonly cacheService!: CacheService;
  public readonly dispatchQueue!: DispatchQueueService;
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
    const unprocessedPushIDs = await this.cacheService.get<string[]>(cacheKey);
    if (!unprocessedPushIDs) {
      throw new InternalServerError([
        'List of pushIDs store in elasticache are misconfigured',
        `CacheKey: ${cacheKey}`,
      ]);
    }

    const pushIDs = unprocessedPushIDs.slice(0, workerBatchSize);
    const cacheValue = unprocessedPushIDs.slice(workerBatchSize);
    await this.cacheService.store(cacheKey, cacheValue);

    // Log to verify the CacheKey has been correctly updated
    const elasticacheValue = await this.cacheService.get(cacheKey);
    this.observability.logger.debug(`CacheKey and amount of pushIDs in the batch`, {
      cacheKey,
      batchLength: (elasticacheValue as string[]).length,
    });

    // Build group messages to users -
    const processedMessages: IProcessedMessage[] = [];
    for (const pushID of pushIDs) {
      processedMessages.push({
        NotificationID: uuid(),
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
    this.observability.logger.info(`Adding record of notification to message table`);

    // Store External User ID and mark record as processed
    await this.notificationsRepository.createRecordBatch(
      processedMessages.map((body) => ({
        ...body,
        ProcessedDateTime: new Date().toISOString(),
        Events: [],
      }))
    );

    // Create analytics event for successful processing of group message
    await this.analyticsService.publishMultipleEvents(processedMessages, NotificationStateEnum.PROCESSED);

    // Push processed messages to Dispatch queue
    await this.dispatchQueue.publishMessageBatch(processedMessages);
  };

  protected async onStart(): Promise<void> {}

  protected async onError(): Promise<void> {}

  protected async onSuccess(): Promise<void> {}

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
  notificationsRepository: iocGetNotificationDynamoRepository(),
})).handler();
