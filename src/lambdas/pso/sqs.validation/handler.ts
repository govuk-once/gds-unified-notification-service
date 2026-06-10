import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetContentValidationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  iocGetProcessingQueueService,
} from '@common/ioc';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  ConfigurationService,
  ContentValidationService,
  MetricsLabels,
  ObservabilityService,
  ProcessingQueueService,
} from '@common/services';
import { BoolParameters } from '@common/utils';
import { IIdentifiableMessage, IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { SQSRecord } from 'aws-lambda';

const requestBodySchema = IMessageSchema;

/**
 * Lambda handling incoming messages from a dedicated SQS Queue
 * - Validates input
 *   - Stores valid messages into notifications dynamodb
 * - Fires analytics events
 * - Pushes valid messages into processing queue
 * 
 * Sample event:
{
  "Records": [
    {
      "messageId": "mockMessageId",
      "receiptHandle": "mockReceiptHandle",
      "body": "{\"NotificationID\":\"337f6248-ed5b-4b73-be1b-4e9a2f8636e0\",\"DepartmentID\":\"DEP01\",\"UserID\":\"test_id_01\",\"CampaignID\":\"CAM_ID\",\"MessageTitle\":\"MOCK_LONG_TITLE\",\"MessageBody\":\"MOCK_LONG_MESSAGE\",\"NotificationTitle\":\"Hey\",\"NotificationBody\":\"You have a new message in the message center.\"}",
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

Sample SQS Body (for pushing messages from portal)
{"NotificationID":"337f6248-ed5b-4b73-be1b-4e9a2f8636e0","DepartmentID":"DEP01","UserID":"test_id_01","CampaignID":"CAM_ID","MessageTitle":"MOCK_LONG_TITLE","MessageBody":"MOCK_LONG_MESSAGE","NotificationTitle":"Hey","NotificationBody":"You have a new message in the message center."}
 */
export class Validation extends BatchQueueOperation<typeof requestBodySchema> {
  public operationId: string = 'validation';
  protected enableConfig: string = BoolParameters.Config.Validation.Enabled;
  public requestBodySchema = requestBodySchema;

  public analyticsService: AnalyticsService;
  public notificationsRepository: NotificationsDynamoRepository;
  public processingQueue: ProcessingQueueService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    protected contentValidationService: ContentValidationService,
    asyncDependencies?: () => HandlerDependencies<Validation>
  ) {
    super(config, observability, contentValidationService);
    this.injectDependencies(asyncDependencies);
  }

  public recordHandler = async (record: SQSRecord) => {
    // Validate Incoming messages
    const data = await this.validateRecord(record);
    const message = data.body;

    if (!message.OrganisationID) {
      throw new Error(
        `OrganisationID is missing from ${message.NotificationID}. It must be stamped from the mTLS certificate.`
      );
    }

    await this.notificationsRepository.createRecord({
      ...message,
      OrganisationID: message.OrganisationID,
      ReceivedDateTime: data.attributes.ApproximateFirstReceiveTimestamp,
      ValidatedDateTime: new Date().toISOString(),
      Events: [],
    });

    // Publish analytics
    await this.analyticsService.publishEvent(message, NotificationStateEnum.VALIDATED);

    // Publish messages to the next stage
    await this.processingQueue.publishMessage(message);
  };

  protected async onStart(identifiableRecord: IIdentifiableMessage): Promise<void> {
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.VALIDATING);
  }

  protected async onError(identifiableRecord: IIdentifiableMessage, error: unknown): Promise<void> {
    await this.analyticsService.publishEvent(
      identifiableRecord,
      NotificationStateEnum.VALIDATION_FAILED,
      this.observability.utilities.formatError(error)
    );
  }

  protected async onSuccess(identifiableRecord: IIdentifiableMessage): Promise<void> {
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.VALIDATED);
  }

  protected batchItemFailureMetric(batchItemFailuresCount: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.BATCH_ITEM_FAILURES_VALIDATION,
      MetricUnit.Count,
      batchItemFailuresCount
    );
  }
}

export const handler = new Validation(
  iocGetConfigurationService(),
  iocGetObservabilityService(),
  iocGetContentValidationService(),
  () => ({
    analyticsService: iocGetAnalyticsService(),
    notificationsRepository: iocGetNotificationDynamoRepository(),
    processingQueue: iocGetProcessingQueueService(),
  })
).handler();
