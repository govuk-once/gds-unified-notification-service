import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetDispatchQueueService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  iocGetProcessingService,
} from '@common/ioc';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  ConfigurationService,
  DispatchQueueService,
  MetricsLabels,
  ObservabilityService,
} from '@common/services';
import { ProcessingService } from '@common/services/processingService';
import { extractIdentifiers, IIdentifiableMessage, IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { BoolParameters } from '@common/utils';
import { SQSRecord } from 'aws-lambda';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';

const requestBodySchema = IMessageSchema;

/**
 * 
 * Lambda handling processing of validated messages
 * - Validates input 
 * - Performs a user ID look up
 * - Fires analytics events: PROCESSING, PROCESSED, PROCESSING_FAILED
 * - Pushes valid messages into dispatch queue
 * 
 * Sample event:
{
  "Records": [
    {
      "messageId": "mockMessageId",
      "receiptHandle": "mockReceiptHandle",
      "body": "{\"NotificationID\":\"1234\",\"DepartmentID\":\"DEP01\",\"UserID\":\"UserID\",\"MessageTitle\":\"MOCK_LONG_TITLE\",\"MessageBody\":\"MOCK_LONG_MESSAGE\",\"NotificationTitle\":\"Hey\",\"NotificationBody\":\"You have a new message in the message center.\"}",
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
      "awsRegion": "us-east-1"
    }
  ]
}
 */
export class Processing extends BatchQueueOperation<typeof requestBodySchema> {
  public operationId: string = 'processing';
  public requestBodySchema = requestBodySchema;
  protected enableConfig: string = BoolParameters.Config.Processing.Enabled;

  public analyticsService: AnalyticsService;
  public notificationsRepository: NotificationsDynamoRepository;
  public dispatchQueue: DispatchQueueService;
  public processingService: ProcessingService;

  constructor(
    public config: ConfigurationService,
    observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<Processing>
  ) {
    super(config, observability);
    this.injectDependencies(dependencies);
  }

  public recordHandler = async (record: SQSRecord): Promise<void> => {
    // Validate Incoming messages
    const data = await this.validateRecord(record);
    const message = data.body;

    // Process messages -
    this.observability.logger.info(`UDP Call:`);
    const result = await this.processingService.send({
      userID: message.UserID,
    });

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
  analyticsService: iocGetAnalyticsService(),
  notificationsRepository: iocGetNotificationDynamoRepository(),
  dispatchQueue: iocGetDispatchQueueService(),
  processingService: iocGetProcessingService(),
})).handler();
