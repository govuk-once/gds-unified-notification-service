import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetDispatchQueueService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { InternalServerError } from '@common/models/Errors/InternalServerError';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { GroupStoreDynamoRepository } from '@common/repositories';
import {
  CacheService,
  ConfigurationService,
  DispatchQueueService,
  MetricsLabels,
  ObservabilityService,
} from '@common/services';
import { NumericParameters } from '@common/utils';
import { IGroupMessageMetadataSchema } from '@project/lambdas/interfaces';
import { extractIdentifiers, IIdentifiableMessage } from '@project/lambdas/interfaces/IMessage';
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
      "body": "{\n\"GroupMessage\": {\n    \"Namespace\": \"namespace\",\n    \"Group\": \"group\",\n    \"Subgroup\": \"subgroup\",\n    \"GroupNotificationID\": \"1234\",\n    \"OrganisationID\": \"ORG_01\",\n    \"NotificationTitle\": \"Travel Alert Update\",\n    \"NotificationBody\": \"You have a new message in the message center.\",\n    \"MessageTitle\": \"MOCK_LONG_TITLE\",\n    \"MessageBody\": \"MOCK_LONG_MESSAGE\"\n  },\n\"GroupNotificationID\": \"1234\",\n\"WorkerID\": 0,\n\"CacheKey\": \"Worker/GroupProcessingWorker/1234/0\"\n}",
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
export class Processing extends BatchQueueOperation<typeof requestBodySchema> {
  public operationId: string = 'groupProcessingWorker';
  public requestBodySchema = requestBodySchema;
  //protected enableConfig: string = BoolParameters.Config.GroupProcessingWorker.Enabled;

  public groupStoreRepository!: GroupStoreDynamoRepository;
  public cacheService!: CacheService;
  public dispatchQueue!: DispatchQueueService;

  constructor(
    public config: ConfigurationService,
    observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<Processing>
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
    const messages: IProcessedMessage[] = [];
    for (const pushID of pushIDs) {
      messages.push({
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

    this.observability.logger.info(`UDP Result:`, { result });
    const processedMessages: IProcessedMessage = { ...message, ExternalUserID: result.externalUserID };

    // Update stored rows in notifications message
    this.observability.logger.info(`Updating entry with timestamp`, extractIdentifiers(processedMessages));

    // Store External User ID and mark record as processed
    await this.notificationsRepository.updateRecord({
      ...extractIdentifiers(processedMessages),
      ExternalUserID: processedMessages.ExternalUserID,
      ProcessedDateTime: new Date().toISOString(),
    });

    // Push processed messages to Dispatch queue
    await this.dispatchQueue.publishMessage(processedMessages);
  };

  protected async onStart(identifiableRecord: IIdentifiableMessage): Promise<void> {
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.PROCESSING);
  }

  protected async onError(identifiableRecord: IIdentifiableMessage, error: unknown): Promise<void> {
    await this.analyticsService.publishEvent(
      identifiableRecord,
      NotificationStateEnum.PROCESSING_FAILED,
      this.observability.formatError(error)
    );
  }

  protected async onSuccess(identifiableRecord: IIdentifiableMessage): Promise<void> {
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.PROCESSED);
  }

  protected batchItemFailureMetric(batchItemFailuresCount: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.BATCH_ITEM_FAILURES_PROCESSING,
      MetricUnit.Count,
      batchItemFailuresCount
    );
  }
}

// IoC
export const handler = new Processing(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsRepository: iocGetNotificationDynamoRepository(),
  cacheService: iocGetCacheService().connect(),
  dispatchQueue: iocGetDispatchQueueService(),
})).handler();
