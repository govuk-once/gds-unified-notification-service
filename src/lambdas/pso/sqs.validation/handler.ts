import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  iocGetOrganisationsDynamoRepository,
  iocGetProcessingQueueService,
  iocGetValidationService,
} from '@common/ioc';
import { BadRequestError, ServiceMisconfigurationError } from '@common/models';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { NotificationsDynamoRepository, OrganisationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  ConfigurationService,
  MetricsLabels,
  ObservabilityService,
  ProcessingQueueService,
  ValidationService,
} from '@common/services';
import {
  IIdentifiableMessage,
  IIdentifiableMessageSchema,
  IMessage,
  IMessageSchema,
} from '@project/lambdas/interfaces/IMessage';
import SSMParameters from '@shared/ssmParameter';
import { SQSRecord } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.object({ ...IMessageSchema.shape, OrganisationID: z.string().optional() });
const identifiableRecordSchema = z.object({ ...IIdentifiableMessageSchema.shape, NotificationID: z.uuid() });

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
{\"NotificationID\":\"200f6248-ed5b-4b73-be0b-4e9a2f8636e0\",\"DepartmentID\":\"DEP01\",\"UserID\":\"USER_ID\",\"CampaignID\":\"CAM_ID\",\"MessageTitle\":\"You have a new Message\",\"MessageBody\":\"Open Notification Centre to read your notifications\",\"NotificationTitle\":\"You have a new Notification\",\"NotificationBody\":\"Here is the Notification body.\"}
 */
export class Validation extends BatchQueueOperation<typeof requestBodySchema, typeof identifiableRecordSchema> {
  public operationId: string = 'validation';
  protected enableConfig = SSMParameters.Config.Validation.Enabled;

  public readonly requestBodySchema = requestBodySchema;
  public readonly identifiableRecordSchema = identifiableRecordSchema;

  public analyticsService!: AnalyticsService;
  public notificationsRepository!: NotificationsDynamoRepository;
  public organisationsRepository!: OrganisationsDynamoRepository;
  public processingQueue!: ProcessingQueueService;
  public validationService!: ValidationService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<Validation>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  public recordHandler = async (record: SQSRecord) => {
    const start = performance.now();

    // Fetch the organisation record from the sender details
    this.observability.logger.info(`Fetch OrganisationID from the sender attribute`);
    const senderRoleID = record.attributes.SenderId.split(':')[0];
    const externalSenderRoles = await this.config.getParameter(
      SSMParameters.Config.ExternalSender.Role,
      z.record(z.string(), z.string())
    );

    const organisationID = Object.entries(externalSenderRoles).find(([, roleID]) => roleID === senderRoleID)?.[0];
    if (!organisationID) {
      this.observability.logger.warn('Sender ID does not match any Role IDs created by UNS', { senderRoleID });
      throw new BadRequestError(['Sender ID does not match any Role IDs created by UNS']);
    }

    // Validate SQS message against schema and parse to message
    this.observability.logger.debug('Validating record against schema and parsing record');
    const data = await this.validateRecord(record);
    const message: IMessage = {
      ...data.body,
      OrganisationID: organisationID,
    };

    // Validates message payload and make sure it matches content rules and organisation config
    const organisationRecord = await this.organisationsRepository.getRecord(organisationID);
    if (!organisationRecord) {
      throw new ServiceMisconfigurationError(['There is no organisation record for this organisation']);
    }
    this.validationService.messageValidation(message, organisationRecord.OrganisationConfig);

    this.observability.metrics.addMetric(
      MetricsLabels.VALIDATION_DURATION,
      MetricUnit.Milliseconds,
      performance.now() - start
    );

    // Publish analytics
    this.observability.logger.debug('Publishing analytics events for validated messages.');
    await this.analyticsService.publishEvent(message, NotificationStateEnum.VALIDATED);

    // Publish messages to the next stage
    this.observability.logger.debug('Requeuing validated message to process queue.');
    await this.processingQueue.publishMessage(message);

    // Create a record of message in Dynamodb
    this.observability.logger.debug('Creating record of validated messages that have been passed to queue.');
    await this.notificationsRepository.createRecord({
      ...message,
      OrganisationID: message.OrganisationID,
      ReceivedDateTime: data.attributes.ApproximateFirstReceiveTimestamp,
      ValidatedDateTime: new Date().toISOString(),
      Events: [],
    });
  };

  protected async onStart(identifiableRecord: IIdentifiableMessage): Promise<void> {
    // Need to find a way to pull organisationID into analytics functions
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.VALIDATING);
  }

  protected async onError(identifiableRecord: IIdentifiableMessage, error: unknown): Promise<void> {
    // Need to find a way to pull organisationID into analytics functions
    await this.analyticsService.publishEvent(
      identifiableRecord,
      NotificationStateEnum.VALIDATION_FAILED,
      this.observability.formatError(error)
    );
  }

  protected async onSuccess(identifiableRecord: IIdentifiableMessage): Promise<void> {
    // Need to find a way to pull organisationID into analytics functions
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

export const handler = new Validation(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsService: iocGetAnalyticsService(),
  notificationsRepository: iocGetNotificationDynamoRepository(),
  organisationsRepository: iocGetOrganisationsDynamoRepository(),
  processingQueue: iocGetProcessingQueueService(),
  validationService: iocGetValidationService(),
})).handler();
