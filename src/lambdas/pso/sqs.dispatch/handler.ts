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
import { RateLimitingError } from '@common/models/Errors/TooManyRequestsError';
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
      throw new RateLimitingError([`Stopping processing from continuing as rate limit has been exceeded`]);
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
      this.observability.formatError(error)
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
