import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetDispatchQueueService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  iocGetProcessingService,
} from '@common/ioc';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  ConfigurationService,
  DispatchQueueService,
  MetricsLabels,
  ObservabilityService,
} from '@common/services';
import { ProcessingService } from '@common/services/processingService';
import { extractIdentifiers, IMessage, ISQSMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { Context, SQSRecord } from 'aws-lambda';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import z from 'zod';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { PartialItemFailureResponse } from '@aws-lambda-powertools/batch/types';
import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
import { QueueEvent } from '@common/operations';
import { BoolParameters } from '@common/utils';
import { MetricUnit } from '@aws-lambda-powertools/metrics';

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
export class Processing extends BatchQueueOperation<IMessage, PartialItemFailureResponse> {
  public operationId: string = 'processing';

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
    const data = await this.validateRecord(ISQSMessageSchema, record, {
      onIdentified: async (identifiableRecord) => {
        await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.PROCESSING);
      },
      onSuccess: (record) => {
        this.observability.logger.info(`Message was successfully parsed`, record.body.NotificationID);
      },
      onError: async (identifiableRecord, validationError) => {
        await this.analyticsService.publishEvent(
          {
            NotificationID: identifiableRecord.NotificationID,
            DepartmentID: identifiableRecord.DepartmentID,
          },
          NotificationStateEnum.PROCESSING_FAILED,
          validationError ? z.prettifyError(validationError) : {}
        );
      },
    });
    const message = data.body;

    // Process messages -
    try {
      this.observability.logger.info(`UDP Call:`);
      const result = await this.processingService.send({
        userID: message.UserID,
      });
      this.observability.logger.info(`UDP Result:`, { result });

      if (!result.success) {
        this.observability.logger.info(`UDP Error:`, { errors: result.errors });
        throw new Error('UDP Error');
      }
      const processedMessages: IProcessedMessage = { ...message, ExternalUserID: result.externalUserID };

      // Update stored rows in notifications message
      this.observability.logger.info(`Updating entry with timestamp`, {
        NotificationID: processedMessages.NotificationID,
        DepartmentID: processedMessages.DepartmentID,
      });

      // Store External User ID and mark record as processed
      await this.notificationsRepository.updateRecord({
        ...extractIdentifiers(processedMessages),
        ExternalUserID: processedMessages.ExternalUserID,
        ProcessedDateTime: new Date().toISOString(),
      });

      // Mark messages as processed
      await this.analyticsService.publishEvent(message, NotificationStateEnum.PROCESSED);

      // Push processed messages to Dispatch queue
      await this.dispatchQueue.publishMessage(processedMessages);
    } catch (e) {
      this.observability.logger.info(`UDP Error:`, { e });
      throw e;
    }
  };

  public async implementation(event: QueueEvent<IMessage>, context: Context): Promise<PartialItemFailureResponse> {
    await this.config.ensureServiceIsEnabled(
      BoolParameters.Config.Common.Enabled,
      BoolParameters.Config.Processing.Enabled
    );

    const processor = new BatchProcessor(EventType.SQS);
    const failures = await processPartialResponse(event, this.recordHandler, processor, {
      context,
    });

    if (failures.batchItemFailures.length > 0) {
      this.observability.metrics.addMetric(
        MetricsLabels.BATCH_ITEM_FAILURES_PROCESSING,
        MetricUnit.Count,
        failures.batchItemFailures.length
      );
    }
    return failures;
  }
}

// IoC
export const handler = new Processing(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsService: iocGetAnalyticsService(),
  notificationsRepository: iocGetNotificationDynamoRepository(),
  dispatchQueue: iocGetDispatchQueueService(),
  processingService: iocGetProcessingService(),
})).handler();
