import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetAnalyticsExportService,
  iocGetCacheService,
  iocGetCampaignsDynamoRepository,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { CampaignsDynamoRepository, NotificationsDynamoRepository } from '@common/repositories';
import { AnalyticsExportService, CacheService, MetricsLabels, ObservabilityService } from '@common/services';
import { ConfigurationService } from '@common/services/configurationService';
import { IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { SQSRecord } from 'aws-lambda';

const requestBodySchema = IAnalyticsSchema;

export class Analytics extends BatchQueueOperation<typeof requestBodySchema> {
  public operationId: string = 'analytics';
  public requestBodySchema = requestBodySchema;

  public cache: CacheService;
  public notifications: NotificationsDynamoRepository;
  public campaigns: CampaignsDynamoRepository;
  public analyticsExportService: AnalyticsExportService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<Analytics>
  ) {
    super(config, observability);
    this.injectDependencies(dependencies);
  }

  public recordHandler = async (record: SQSRecord) => {
    // Validate record and extract analytics event entry
    this.observability.logger.debug('Validating record as type analytics record.');
    const analyticsRecord = await this.validateRecord(record);
    const entry = analyticsRecord.body;

    // Update notification object with status event
    this.observability.logger.debug('Adding analytics event to notification record.', {
      NotificationID: entry.NotificationID,
      Status: entry.Event,
    });
    await this.notifications.addEvent(entry);

    // Export event to log group
    this.observability.logger.debug('Adding analytics event to log group', {
      NotificationID: entry.NotificationID,
      Status: entry.Event,
    });
    await this.analyticsExportService.logAnalytics(entry);

    // Increments campaign
    if (entry.CampaignID) {
      this.observability.logger.debug(`Incrementing CampaignID`, { CampaignID: entry.CampaignID });
      await this.campaigns.incrementCampaigns(entry.CampaignID, entry.OrganisationID, entry.DepartmentID, entry.Event);
    }

    // Updates Elasticache with notification status
    const cacheKey = `/${entry.DepartmentID ?? entry.OrganisationID}/${entry.NotificationID}/Status`;
    await this.cache.store(cacheKey, entry.Event);
    this.observability.logger.debug(`Updating Elasticache with notification status`, {
      NotificationID: entry.NotificationID,
      Status: entry.Event,
    });
  };

  protected async onStart(): Promise<void> {}

  protected async onError(): Promise<void> {}

  protected async onSuccess(): Promise<void> {}

  protected batchItemFailureMetric(batchItemFailuresCount: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.BATCH_ITEM_FAILURES_ANALYTICS,
      MetricUnit.Count,
      batchItemFailuresCount
    );
  }
}

export const handler = new Analytics(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  cache: iocGetCacheService().connect(),
  notifications: iocGetNotificationDynamoRepository(),
  campaigns: iocGetCampaignsDynamoRepository(),
  analyticsExportService: iocGetAnalyticsExportService(),
})).handler();
