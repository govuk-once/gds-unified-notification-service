import { MetricUnit } from '@aws-lambda-powertools/metrics';
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
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  CacheService,
  CircuitBreakerService,
  ConfigurationService,
  MetricsLabels,
  NotificationService,
  ObservabilityService,
} from '@common/services';
import { BoolParameters, NumericParameters } from '@common/utils';
import { extractIdentifiers, IIdentifiableMessage } from '@project/lambdas/interfaces/IMessage';
import { IProcessedMessageSchema } from '@project/lambdas/interfaces/IProcessedMessage';
import { SQSRecord } from 'aws-lambda';

const requestBodySchema = IProcessedMessageSchema;

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

export class Dispatch extends BatchQueueOperation<typeof requestBodySchema> {
  public operationId: string = 'dispatch';
  protected enableConfig: string = BoolParameters.Config.Dispatch.Enabled;
  public requestBodySchema = requestBodySchema;

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
    super(config, observability);
    this.injectDependencies(dependencies);
  }

  public recordHandler = async (record: SQSRecord) => {
    // Validate Incoming messages
    const data = await this.validateRecord(record);
    const message = data.body;

    // Check circuit breaker status before dispatch and fail if circuit breaker rate limiting enforced
    await this.circuitBreakerService.checkCircuit();

    // Rate limits request if rate limiting is enforced
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
    const result = await this.circuitBreakerService.use(
      async () =>
        await this.notificationsService.send({
          ExternalUserID: message.ExternalUserID,
          NotificationID: message.NotificationID,
          NotificationTitle: message.NotificationTitle,
          NotificationBody: message.NotificationBody,
        })
    );
    this.observability.logger.info(`Notification dispatched`, {
      ...extractIdentifiers(message),
      ProviderRequestID: result.requestId,
    });

    // Update stored record with timestamp - also reset expiration date
    await this.notificationsDynamoRepository.updateRecord(
      {
        ...extractIdentifiers(message),
        DispatchedDateTime: new Date().toISOString(),
      },
      { resetExpirationDate: true }
    );

    // Increment rate limiter post request
    await this.cacheService.rateLimit(
      `NOTIFICATION_PROVIDER_RATE_LIMIT`,
      await this.config.getNumericParameter(NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute),
      1
    );
  };

  protected async onStart(identifiableRecord: IIdentifiableMessage): Promise<void> {
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.DISPATCHING);
  }

  protected async onError(identifiableRecord: IIdentifiableMessage, error: unknown): Promise<void> {
    await this.analyticsService.publishEvent(
      identifiableRecord,
      NotificationStateEnum.DISPATCHING_FAILED,
      this.observability.utilities.formatError(error)
    );
  }

  protected async onSuccess(identifiableRecord: IIdentifiableMessage): Promise<void> {
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.DISPATCHED);
  }

  protected batchItemFailureMetric(batchItemFailuresCount: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.BATCH_ITEM_FAILURES_DISPATCH,
      MetricUnit.Count,
      batchItemFailuresCount
    );
  }
}

export const handler = new Dispatch(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
  notificationsService: iocGetNotificationService(),
  analyticsService: iocGetAnalyticsService(),
  cacheService: iocGetCacheService().connect(),
  circuitBreakerService: iocGetCircuitBreakerService(DISPATCH_PLATFORM_KEY),
})).handler();
