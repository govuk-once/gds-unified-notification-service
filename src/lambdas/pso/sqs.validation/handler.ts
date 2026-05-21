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
import { IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { SQSRecord } from 'aws-lambda';
import z from 'zod';

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
    const data = await this.validateRecord(record, {
      onIdentified: async (identifiableRecord) => {
        await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.VALIDATING);
      },
      onSuccess: (record) => {
        this.observability.logger.info(`Message was successfully parsed`, record.body.NotificationID);
      },
      onError: async (identifiableRecord, validationError) => {
        const errorMsg = validationError ? z.prettifyError(validationError) : {};
        this.observability.logger.error(`Failed to parse message`, errorMsg);
        await this.analyticsService.publishEvent(
          {
            NotificationID: identifiableRecord.NotificationID,
            DepartmentID: identifiableRecord.DepartmentID,
          },
          NotificationStateEnum.VALIDATION_FAILED,
          validationError ? z.prettifyError(validationError) : {}
        );
      },
    });
    const message = data.body;

    await this.notificationsRepository.createRecord({
      ...message,
      ReceivedDateTime: data.attributes.ApproximateFirstReceiveTimestamp,
      ValidatedDateTime: new Date().toISOString(),
      Events: [],
    });

    // Publish analytics
    await this.analyticsService.publishEvent(message, NotificationStateEnum.VALIDATED);

    // Publish messages to the next stage
    await this.processingQueue.publishMessage(message);
  };

  protected batchItemFailureMetric = (batchItemFailuresCount: number) => {
    this.observability.metrics.addMetric(
      MetricsLabels.BATCH_ITEM_FAILURES_VALIDATION,
      MetricUnit.Count,
      batchItemFailuresCount
    );
  };
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
