import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetCacheService,
  iocGetCircuitBreakerService,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetNotificationService,
  iocGetObservabilityService,
} from '@common/ioc';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { QueueEvent, QueueHandler } from '@common/operations';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  CacheService,
  CircuitBreakerService,
  ConfigurationService,
  NotificationService,
  ObservabilityService,
} from '@common/services';
import { BoolParameters, groupValidation, NumericParameters } from '@common/utils';
import { extractIdentifiers, IIdentifiableMessageSchema } from '@project/lambdas/interfaces/IMessage';
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
const DISPATCH_PLATFORM_KEY = 'notification_dispatch';

export class Dispatch extends QueueHandler<IProcessedMessage, void> {
  public operationId: string = 'dispatch';

  public notificationsDynamoRepository: NotificationsDynamoRepository;
  public analyticsService: AnalyticsService;
  public notificationsService: NotificationService;
  public cacheService: CacheService;
  public circuitBreakerService: CircuitBreakerService;

  constructor(
    public config: ConfigurationService,
    observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<Dispatch>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  public async implementation(event: QueueEvent<IProcessedMessage>, context: Context) {
    await this.config.ensureServiceIsEnabled(
      BoolParameters.Config.Common.Enabled,
      BoolParameters.Config.Dispatch.Enabled
    );

    // Trigger received notification events
    const [, identifiableRecords] = await groupValidation(
      event.Records,
      SqsRecordSchema.extend({
        body: IIdentifiableMessageSchema,
      })
    );

    await this.circuitBreakerService.checkCircuit();

    this.observability.logger.info(`Identifiable records`, { identifiableRecords });
    await this.analyticsService.publishMultipleEvents(
      identifiableRecords.map(({ valid }) => valid.body),
      NotificationStateEnum.DISPATCHING
    );

    // Segregate inputs - parse all, group by result, for invalid records - parse using partial approach to extract valid fields
    const [records, validRecords, invalidRecords] = await groupValidation(
      event.Records.map((record) => record.body),
      IProcessedMessageSchema
    );

    // Invalid messages should not appear - however it's good to filter these out & remove from
    if (invalidRecords.length > 0) {
      this.observability.logger.error(`Invalid elements detected within the SQS Message, omitting those`, {
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
        throw new Error(`Stopping processing from continuing as rate limit has been exceeded`);
      }

      // Prepare request
      const metadata = {
        NotificationID: valid.NotificationID,
        DepartmentID: valid.DepartmentID,
      };

      const result = await this.circuitBreakerService.use(async () => {
        const result = await this.notificationsService.send({
          ExternalUserID: valid.ExternalUserID,
          NotificationID: valid.NotificationID,
          NotificationTitle: valid.NotificationTitle,
          NotificationBody: valid.NotificationBody,
        });
        if (result.success) {
          return result;
        }

        if (result.errors) {
          throw new Error(JSON.stringify(result.errors));
        }
        throw new Error('Request to notification provider failed with no error message');
      });

      // Update stored record with timestamp - also reset expiration date
      await this.notificationsDynamoRepository.updateRecord(
        {
          ...extractIdentifiers(valid),
          DispatchedDateTime: new Date().toISOString(),
        },
        { resetExpirationDate: true }
      );

      // Increment rate limiter post request
      await this.cacheService.rateLimit(
        `NOTIFICATION_PROVIDER_RATE_LIMIT`,
        await this.config.getNumericParameter(
          NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute
        ),
        1
      );

      // Analytics event + circuit breaker state management
      try {
        if (result.result?.success) {
          this.observability.logger.info(`Notification dispatched`, {
            ...metadata,
            ProviderRequestID: result.result.requestId,
          });
          await this.analyticsService.publishEvent(extractIdentifiers(valid), NotificationStateEnum.DISPATCHED);
        } else {
          this.observability.logger.error(`Notification failed to dispatch`, { ...metadata });
          await this.analyticsService.publishEvent(extractIdentifiers(valid), NotificationStateEnum.DISPATCHING_FAILED);
        }
      } catch {
        this.observability.logger.error(`Notification failed to dispatch`, { ...metadata });
        await this.analyticsService.publishEvent(extractIdentifiers(valid), NotificationStateEnum.DISPATCHING_FAILED);
      }
    }

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
        NotificationStateEnum.DISPATCHING_FAILED,
        errors
      );
    }
  }
}

export const handler = new Dispatch(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
  notificationsService: iocGetNotificationService(),
  analyticsService: iocGetAnalyticsService(),
  cacheService: iocGetCacheService().connect(),
  circuitBreakerService: iocGetCircuitBreakerService(DISPATCH_PLATFORM_KEY),
})).handler();
