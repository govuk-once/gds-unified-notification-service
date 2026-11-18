import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetDispatchQueueService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { NotificationStateEnum } from '@common/models';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  ConfigurationService,
  DispatchQueueService,
  MetricsLabels,
  ObservabilityService,
} from '@common/services';
import { generateNotificationIDForGroupMessage } from '@common/utils/checksumString';
import {
  IGroupMessageMetadataSchema,
  IIdentifiableGroupMessageSchema,
  IProcessedMessage,
} from '@common/models/interfaces';
import SSMParameters from '@shared/ssmParameter';
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
 * - Reads the chunk of pushIDs carried in the message
 * - Builds message template using the group message and the pushIDs
 * - Pushes group messages into dispatch queue
 * 
 * Sample event:
{
  "Records": [
    {
      "messageId": "mockMessageId",
      "receiptHandle": "mockReceiptHandle",
      "body": "{\n\"GroupMessage\": {\n    \"Namespace\": \"namespace\",\n    \"Group\": \"group\",\n    \"Subgroup\": \"subgroup\",\n    \"GroupNotificationID\": \"1234\",\n    \"OrganisationID\": \"ORG_01\",\n    \"NotificationTitle\": \"Travel Alert Update\",\n    \"NotificationBody\": \"You have a new message in the message center.\",\n    \"MessageTitle\": \"MOCK_LONG_TITLE\",\n    \"MessageBody\": \"MOCK_LONG_MESSAGE\"\n  },\n\"GroupNotificationID\": \"1234\",\n\"PushIDs\": [\"pushID1\", \"pushID2\"],\n\"APIGWExtendedID\": \"requestId\",\n\"ReceivedDateTime\": \"2026-08-01T:12:00:00.000Z\",\n\"ValidatedDateTime\": \"2026-08-01T:12:00:00.600Z\"\n}",
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
  protected enableConfig = SSMParameters.Config.GroupProcessingWorker.Enabled;

  public readonly requestBodySchema = requestBodySchema;
  public readonly identifiableRecordSchema = identifiableRecordSchema;

  public readonly analyticsService!: AnalyticsService;
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
    const pushIDs = data.body.PushIDs;
    const start = performance.now();

    // Build group messages to users -
    const processedMessages: IProcessedMessage[] = [];
    for (const pushID of pushIDs) {
      const notificationID = generateNotificationIDForGroupMessage(pushID, groupMessage);
      processedMessages.push({
        NotificationID: notificationID,
        GroupNotificationID: groupMessage.GroupNotificationID,
        OrganisationID: groupMessage.OrganisationID,
        ExternalUserID: pushID,
        CampaignID: groupMessage.CampaignID,
        NotificationTitle: groupMessage.NotificationTitle,
        NotificationBody: groupMessage.NotificationBody,
        MessageTitle: groupMessage.MessageTitle,
        MessageBody: groupMessage.MessageBody,
        ExpiresInDays: groupMessage.ExpiresInDays,
        Channel: groupMessage.Channel,
        DeeplinkURL: groupMessage.DeeplinkURL,
        // UserID is explicitly omitted here
      });
    }

    // Add record of group notifications to message table
    this.observability.logger.debug('Adding record of notification to message table');
    const processedDateTime = new Date().toISOString();
    const messageRecords = processedMessages.map(({ ExpiresInDays, ...body }) => ({
      ...body,
      APIGWExtendedID: data.body.APIGWExtendedID,
      ReceivedDateTime: data.body.ReceivedDateTime,
      ValidatedDateTime: data.body.ValidatedDateTime,
      ProcessedDateTime: processedDateTime,
      RequestedDaysToExpire: ExpiresInDays,
      Events: [],
    }));
    // TODO: reprocessing a chunk (SQS retry, e.g. after a timeout or a failed dispatch publish) is not a no-op:
    // - createRecordBatch uses unconditional puts, so it overwrites records that were already created and may have
    //   progressed (e.g. DispatchedDateTime, Events), resetting their status until redispatched.
    // - every pushID in the chunk is published to the dispatch queue again, including ones already queued. Only the
    //   provider's idempotency key (NotificationID) prevents a duplicate push, and that only holds within its window.
    await this.notificationsRepository.createRecordBatch(messageRecords);

    // Publish analytics alongside the dispatch publish rather than before it, so neither waits on the other.
    // Analytics never throws, so it cannot mask or cause a dispatch failure.
    this.observability.logger.info('Successful processed batch of pushIDs, sending to dispatch queue');
    const analyticsPublished = this.analyticsService.publishMultipleEvents(
      processedMessages,
      NotificationStateEnum.PROCESSED
    );
    try {
      await this.dispatchQueue.publishMessageBatch(processedMessages);
    } finally {
      await analyticsPublished;
    }

    this.observability.metrics.addMetric(
      MetricsLabels.GROUP_PROCESSING_DURATION_PER_MESSAGE,
      MetricUnit.Milliseconds,
      (performance.now() - start) / pushIDs.length
    );
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
  dispatchQueue: iocGetDispatchQueueService(),
  notificationsRepository: iocGetNotificationDynamoRepository(),
})).handler();
