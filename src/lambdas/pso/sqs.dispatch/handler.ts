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
import { IProcessedMessageSchema } from '@project/lambdas/interfaces';
import {
  extractIdentifiers,
  IIdentifiableMessage,
  IIdentifiableMessageSchema,
} from '@project/lambdas/interfaces/IMessage';
import SSMParameters from '@shared/ssmParameter';
import { SQSRecord } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = IProcessedMessageSchema;
const identifiableRecordSchema = z.object({ ...IIdentifiableMessageSchema.shape, NotificationID: z.uuid() });

const DISPATCH_PLATFORM_KEY = 'notification_dispatch';

export class Dispatch extends BatchQueueOperation<typeof requestBodySchema, typeof identifiableRecordSchema> {
  public readonly operationId: string = 'dispatch';
  protected readonly enableConfig = SSMParameters.Config.Dispatch.Enabled;

  public readonly requestBodySchema = requestBodySchema;
  public readonly identifiableRecordSchema = identifiableRecordSchema;

  public notificationsDynamoRepository!: NotificationsDynamoRepository;
  public analyticsService!: AnalyticsService;
  public notificationsService!: NotificationService;
  public cacheService!: CacheService;
  public circuitBreakerService!: CircuitBreakerService;

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
    const featureEnabledDeepLinkUrl = await this.config.getParameter(SSMParameters.Config.FeatureFlags.DeepLinkUrl);
    const data = await this.validateRecord(record);
    const message = data.body;

    // Check circuit breaker status before dispatch and fail if circuit breaker rate limiting enforced
    await this.circuitBreakerService.checkCircuit();

    // Rate limits request if rate limiting is enforced
    if (
      (
        await this.cacheService.rateLimit(
          `NOTIFICATION_PROVIDER_RATE_LIMIT`,
          await this.config.getParameter(SSMParameters.Config.Common.Cache.NotificationsProviderRateLimitPerMinute)
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
          DeeplinkURL: featureEnabledDeepLinkUrl ? message.DeeplinkURL : undefined,
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
      await this.config.getParameter(SSMParameters.Config.Common.Cache.NotificationsProviderRateLimitPerMinute),
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
