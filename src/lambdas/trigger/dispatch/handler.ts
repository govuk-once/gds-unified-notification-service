import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  HandlerDependencies,
  initializeDependencies,
  iocGetAnalyticsService,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetInboundDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetNotificationService,
  iocGetTracer,
} from '@common/ioc';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { QueueEvent, QueueHandler } from '@common/operations';
import { InboundDynamoRepository } from '@common/repositories';
import { AnalyticsService, CacheService, ConfigurationService, NotificationService } from '@common/services';
import { BoolParameters, groupValidation, NumericParameters } from '@common/utils';
import { extractIdentifiers, IIdentifieableMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { IProcessedMessage, IProcessedMessageSchema } from '@project/lambdas/interfaces/IProcessedMessage';
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
      "body": "{\"NotificationID\":\"337f6248-ed5b-4b73-be0b-4e9a2f8636e0\",\"DepartmentID\":\"DEP01\",\"UserID\":\"test_id_01\",\"ExternalUserID\":\"test_id_01\",\"MessageTitle\":\"MOCK_LONG_TITLE\",\"MessageBody\":\"MOCK_LONG_MESSAGE\",\"NotificationTitle\":\"Hey\",\"NotificationBody\":\"You have a new message in the message center.\"}",
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
export class Dispatch extends QueueHandler<unknown, void> {
  public operationId: string = 'dispatch';

  public inboundDynamodbRepository: InboundDynamoRepository;
  public analyticsService: AnalyticsService;
  public notificationsService: NotificationService;
  public cacheService: CacheService;

  constructor(
    public config: ConfigurationService,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer,
    public asyncDependencies?: () => HandlerDependencies<Dispatch>
  ) {
    super(logger, metrics, tracer);
  }

  public async initialize() {
    await initializeDependencies(this, this.asyncDependencies);
  }

  public async implementation(event: QueueEvent<IProcessedMessage>, context: Context) {
    // TODO: Implement retry mechanism - This call throw errors if service is disabled
    await this.config.ensureServiceIsEnabled(
      BoolParameters.Config.Common.Enabled,
      BoolParameters.Config.Dispatch.Enabled
    );

    await this.initialize();

    // Trigger received notification events
    const [, identifiableRecords] = groupValidation(
      event.Records,
      SqsRecordSchema.extend({
        body: IIdentifieableMessageSchema,
      })
    );

    this.logger.info(`Identifiable records`, { identifiableRecords });
    await this.analyticsService.publishMultipleEvents(
      identifiableRecords.map(({ valid }) => valid.body),
      ValidationEnum.DISPATCHING
    );

    // Segregate inputs - parse all, group by result, for invalid records - parse using partial approach to extract valid fields
    const [records, validRecords, invalidRecords] = groupValidation(
      event.Records.map((record) => record.body),
      IProcessedMessageSchema
    );

    // Invalid messages should not appear - however it's good to filter these out & remove from
    if (invalidRecords.length > 0) {
      this.logger.error(`Invalid elements detected within the SQS Message, omitting those`, {
        invalidRecords: invalidRecords.map((record) => ({ raw: record.raw, errors: record.errors })),
        totalRecords: records,
      });
    }

    // Process the notification requests
    for (const { valid } of validRecords) {
      // Confirm whether sending notifications will not exceed the rate limit
      if (
        (
          await this.cacheService.rateLimit(
            `NOTIFICATION_PROVIDER_RATE_LIMIT`,
            await this.config.getNumericParameter(
              NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute
            )
          )
        ).exceeded
      ) {
        throw new Error(`Stopping processing from continouring as rate limit has been exceeded`);
      }

      // Prepare request
      const metadata = {
        NotificationID: valid.NotificationID,
        DepartmentID: valid.DepartmentID,
      };
      const { requestId, success } = await this.notificationsService.send({
        ExternalUserID: valid.ExternalUserID,
        NotificationID: valid.NotificationID,
        NotificationTitle: valid.NotificationTitle,
        NotificationBody: valid.NotificationBody,
      });

      // Update stored record with timestamp
      await this.inboundDynamodbRepository.updateRecord<Partial<IMessageRecord>>({
        ...extractIdentifiers(valid),
        DispatchedStartDateTime: new Date().toISOString(),
      });

      // Increment rate limiter post request
      await this.cacheService.rateLimit(
        `NOTIFICATION_PROVIDER_RATE_LIMIT`,
        await this.config.getNumericParameter(
          NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute
        ),
        1
      );

      // Analytics event
      if (success) {
        this.logger.info(`Notification dispatched`, { ...metadata, ProviderRequestID: requestId });
        await this.analyticsService.publishEvent(extractIdentifiers(valid), ValidationEnum.DISPATCHED);
      } else {
        this.logger.error(`Notification failed to dispatch`, { ...metadata });
        await this.analyticsService.publishEvent(extractIdentifiers(valid), ValidationEnum.DISPATCHING_FAILED);
      }
    }

    // Store Analytics for failed parses - if they have notificationID
    for (const { raw, errors } of invalidRecords) {
      const { NotificationID, DepartmentID } = extractIdentifiers(raw);
      // Log invalid entries
      if (NotificationID == undefined || DepartmentID == undefined) {
        this.logger.info(`Supplied message does not contain NotificationID or DepartmentID, rejecting record`, {
          raw,
          errors,
        });
        continue;
      }
      await this.analyticsService.publishEvent(
        {
          NotificationID: NotificationID,
          DepartmentID: DepartmentID,
        },
        ValidationEnum.DISPATCHING_FAILED,
        errors
      );
    }
  }
}

export const handler = new Dispatch(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer(),
  () => ({
    inboundDynamodbRepository: iocGetInboundDynamoRepository(),
    notificationsService: iocGetNotificationService(),
    analyticsService: iocGetAnalyticsService(),
    cacheService: iocGetCacheService().connect(),
  })
).handler();
