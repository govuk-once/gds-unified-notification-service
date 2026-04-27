import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
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
import { QueueEvent, QueueHandler } from '@common/operations';
import { NotificationsDynamoRepository } from '@common/repositories';
import { AnalyticsService, ConfigurationService, DispatchQueueService, ObservabilityService } from '@common/services';
import { ProcessingService } from '@common/services/processingService';
import { BoolParameters } from '@common/utils';
import {
  extractIdentifiers,
  IIdentifieableMessageSchema,
  IMessage,
  IMessageSchema,
} from '@project/lambdas/interfaces/IMessage';
import { Context, SQSRecord } from 'aws-lambda';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import z from 'zod';

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
export class Processing extends QueueHandler<IMessage, void> {
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
    super(observability);
    this.injectDependencies(dependencies);
  }

  private recordHandler = async (data: SQSRecord): Promise<void> => {
    // Trigger received notification events
    const parsedResult = await SqsRecordSchema.extend({
      body: IIdentifieableMessageSchema,
    }).safeParseAsync(data);

    if (!parsedResult.success) {
      const raw = data.body;
      const error = parsedResult.error ? z.prettifyError(parsedResult.error) : {};
      this.observability.logger.info(
        `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
        {
          raw,
          error,
        }
      );
      return;
    }

    const identifiableRecord = parsedResult.data;
    this.observability.logger.info(`Identifiable record`, { identifiableRecord });
    await this.analyticsService.publishEvent(identifiableRecord.body, NotificationStateEnum.PROCESSING);

    // Validate Incoming messages
    const validatedRecord = await SqsRecordSchema.extend({
      body: IMessageSchema,
    }).safeParseAsync(data);

    if (!validatedRecord.success) {
      this.observability.logger.info(`Message failed validated`, identifiableRecord.body.NotificationID);
      const validationError = validatedRecord.error ? z.prettifyError(validatedRecord.error) : {};

      await this.analyticsService.publishEvent(
        {
          NotificationID: identifiableRecord.body.NotificationID,
          DepartmentID: identifiableRecord.body.DepartmentID,
        },
        NotificationStateEnum.PROCESSING_FAILED,
        validationError
      );
      return;
    }

    const message = validatedRecord.data.body;
    this.observability.logger.info(`Message was validated`, message.NotificationID);

    // Process messages -
    try {
      this.observability.logger.info(`UDP Call:`);
      const result = await this.processingService.send({
        userID: message.UserID,
      });
      this.observability.logger.info(`UDP Result:`, { result });

      if (!result.success) {
        this.observability.logger.info(`UDP Error:`, { errors: result.errors });
        return;
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
    }
  };

  public async implementation(event: QueueEvent<IMessage>, context: Context) {
    await this.config.ensureServiceIsEnabled(
      BoolParameters.Config.Common.Enabled,
      BoolParameters.Config.Processing.Enabled
    );

    const processor = new BatchProcessor(EventType.SQS);
    await processPartialResponse(event, this.recordHandler, processor, {
      context,
    });
  }
}

// IoC
export const handler = new Processing(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsService: iocGetAnalyticsService(),
  notificationsRepository: iocGetNotificationDynamoRepository(),
  dispatchQueue: iocGetDispatchQueueService(),
  processingService: iocGetProcessingService(),
})).handler();
