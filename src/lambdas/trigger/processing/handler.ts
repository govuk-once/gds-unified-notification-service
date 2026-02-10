import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetDispatchQueueService,
  iocGetInboundDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { QueueEvent, QueueHandler } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories';
import { AnalyticsService, ConfigurationService, DispatchQueueService, ObservabilityService } from '@common/services';
import { BoolParameters, groupValidation } from '@common/utils';
import {
  extractIdentifiers,
  IIdentifieableMessageSchema,
  IMessage,
  IMessageSchema,
} from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Context } from 'aws-lambda';

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
  public inboundTable: InboundDynamoRepository;
  public dispatchQueue: DispatchQueueService;

  constructor(
    public config: ConfigurationService,
    observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<Processing>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  public async implementation(event: QueueEvent<IMessage>, context: Context) {
    // TODO: Implement retry mechanism - This call throw errors if service is disabled
    await this.config.ensureServiceIsEnabled(
      BoolParameters.Config.Common.Enabled,
      BoolParameters.Config.Processing.Enabled
    );

    // Trigger received notification events
    const [, identifiableRecords] = groupValidation(
      event.Records,
      SqsRecordSchema.extend({
        body: IIdentifieableMessageSchema,
      })
    );
    this.observability.logger.info(`Identifiable records`, { identifiableRecords });
    await this.analyticsService.publishMultipleEvents(
      identifiableRecords.map(({ valid }) => valid.body),
      ValidationEnum.PROCESSING
    );

    // Validate Incoming messages
    const [, validRecords, invalidRecords] = groupValidation(
      event.Records.map((record) => record.body),
      IMessageSchema
    );
    this.observability.logger.info(`Validation results`, {
      valid: validRecords.length,
      invalid: invalidRecords.length,
    });

    // (MOCK) Getting the OneSignalID from UDP - For now we just map UserID to ExternalUserID 1:1
    const processedMessages = validRecords.map(({ valid: body }) => ({
      ...body,
      ExternalUserID: `${body.UserID}`,
    }));

    // Update stored rows in inbound message
    for (const processed of processedMessages) {
      this.observability.logger.info(`Updating entry with timestamp`, {
        NotificationID: processed.NotificationID,
        DepartmentID: processed.DepartmentID,
      });

      // Store External User ID and mark record as processed
      await this.inboundTable.updateRecord<Partial<IMessageRecord>>({
        ...extractIdentifiers(processed),
        ExternalUserID: processed.ExternalUserID,
        ProcessedDateTime: new Date().toISOString(),
      });
    }

    // Mark messages as processed
    await this.analyticsService.publishMultipleEvents(
      validRecords.map(({ valid }) => valid),
      ValidationEnum.PROCESSED
    );

    // Push processed messages to Dispatch queue
    await this.dispatchQueue.publishMessageBatch(processedMessages);

    // Store Analytics for failed parses - if they have notificationID
    for (const { raw, errors } of invalidRecords) {
      const { NotificationID, DepartmentID } = extractIdentifiers(raw);
      // Log invalid entries
      if (NotificationID == undefined || DepartmentID == undefined) {
        this.observability.logger.info(
          `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
          {
            raw,
            errors,
          }
        );
        continue;
      }
      await this.analyticsService.publishEvent(
        {
          NotificationID: NotificationID,
          DepartmentID: DepartmentID,
        },
        ValidationEnum.PROCESSING_FAILED,
        errors
      );
    }
  }
}

export const handler = new Processing(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsService: iocGetAnalyticsService(),
  inboundTable: iocGetInboundDynamoRepository(),
  dispatchQueue: iocGetDispatchQueueService(),
})).handler();
