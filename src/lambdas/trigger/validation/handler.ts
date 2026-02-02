import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import {
  HandlerDependencies,
  initializeDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetInboundDynamoRepository,
  iocGetObservability,
  iocGetProcessingQueueService,
} from '@common/ioc';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { QueueEvent, QueueHandler } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories';
import { AnalyticsService, ConfigurationService, ProcessingQueueService } from '@common/services';
import { BoolParameters, groupValidation } from '@common/utils';
import { Observability } from '@common/utils/observability';
import {
  extractIdentifiers,
  IIdentifieableMessageSchema,
  IMessage,
  IMessageSchema,
} from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Context } from 'aws-lambda';

/**
 * Lambda handling incoming messages from a dedicated SQS Queue
 * - Validates input
 *   - Stores valid messages into inbound dynamodb
 * - Fires analytics events
 * - Pushes valid messages into processing queue
 * 
 * Sample event:
{
  "Records": [
    {
      "messageId": "mockMessageId",
      "receiptHandle": "mockReceiptHandle",
      "body": "{\"NotificationID\":\"337f6248-ed5b-4b73-be1b-4e9a2f8636e0\",\"DepartmentID\":\"DEP01\",\"UserID\":\"test_id_01\",\"MessageTitle\":\"MOCK_LONG_TITLE\",\"MessageBody\":\"MOCK_LONG_MESSAGE\",\"NotificationTitle\":\"Hey\",\"NotificationBody\":\"You have a new message in the message center.\"}",
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
export class Validation extends QueueHandler<IMessage> {
  public operationId: string = 'validation';

  public analyticsService: AnalyticsService;
  public inboundTable: InboundDynamoRepository;
  public processingQueue: ProcessingQueueService;

  constructor(
    protected config: ConfigurationService,
    protected observability: Observability,
    public asyncDependencies?: () => HandlerDependencies<Validation>
  ) {
    super(observability);
  }

  public async initialize() {
    await initializeDependencies(this, this.asyncDependencies);
  }

  public async implementation(event: QueueEvent<IMessage>, context: Context) {
    // TODO: Implement retry mechanism - This call throw errors if service is disabled
    await this.config.ensureServiceIsEnabled(
      BoolParameters.Config.Common.Enabled,
      BoolParameters.Config.Validation.Enabled
    );

    //
    await this.initialize();

    // Trigger received notifications events
    const [, identifiableRecords] = groupValidation(
      event.Records,
      SqsRecordSchema.extend({
        body: IIdentifieableMessageSchema,
      })
    );
    this.observability.logger.info(`Identifiable records`, { identifiableRecords });
    await this.analyticsService.publishMultipleEvents(
      identifiableRecords.map(({ valid }) => valid.body),
      ValidationEnum.VALIDATING
    );

    // Segregate inputs - parse all, group by result, for invalid record - parse using partial approach to extract valid fields
    const [, validRecords, invalidRecords] = groupValidation(
      event.Records,
      SqsRecordSchema.extend({ body: IMessageSchema })
    );
    this.observability.logger.info(`Validation results`, {
      valid: validRecords.length,
      invalid: invalidRecords.length,
    });

    if (validRecords.length > 0) {
      // Store valid entries in inbound table
      await this.inboundTable.createRecordBatch(
        validRecords.map(
          ({ valid: { body, attributes } }): IMessageRecord => ({
            ...body,
            ReceivedDateTime: attributes.ApproximateFirstReceiveTimestamp,
            ValidatedDateTime: new Date().toISOString(),
          })
        )
      );

      // Publish analytics & push items to the processing queue
      await this.analyticsService.publishMultipleEvents(
        validRecords.map(({ valid }) => valid.body),
        ValidationEnum.VALIDATED
      );

      // Publish messages to the next stage
      await this.processingQueue.publishMessageBatch(validRecords.map(({ valid }) => valid.body));
    }

    // Store Analytics for failed parses - if they have notificationID
    for (const { raw, errors } of invalidRecords) {
      const { NotificationID, DepartmentID } = extractIdentifiers(raw.body);
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
        ValidationEnum.VALIDATION_FAILED,
        errors
      );
    }
  }
}
export const handler = new Validation(iocGetConfigurationService(), iocGetObservability(), () => ({
  analyticsService: iocGetAnalyticsService(),
  inboundTable: iocGetInboundDynamoRepository(),
  processingQueue: iocGetProcessingQueueService(),
})).handler();
