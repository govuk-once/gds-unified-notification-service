import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetBqAnalyticsExportService,
  iocGetCacheService,
  iocGetCampaignsDynamoRepository,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { CampaignsDynamoRepository, NotificationsDynamoRepository } from '@common/repositories';
import { CacheService, MetricsLabels, ObservabilityService, BqAnalyticsExportService } from '@common/services';
import { ConfigurationService } from '@common/services/configurationService';
import { IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { SQSRecord } from 'aws-lambda';

const requestBodySchema = IAnalyticsSchema;

/**
 * Lambda handling storing analytics events into the dedicated events DynamoDB Table, it also updates cache keys within elasticache
 * Sample event:
 {
  "Records": [
    {
      "messageId": "19dd0b57-b21e-4ac1-bd88-01bbb068cb78",
      "receiptHandle": "MessageReceiptHandle",
      "body": "{\"DepartmentID\":\"TEST01\",\"NotificationID\":\"not1\",\"EventID\":\"EVENT01\",\"Event\":\"VALIDATED\",\"EventDateTime\":\"2026-01-22T00:00:01Z\",\"APIGWExtendedID\":\"testExample\",\"CampaignID\":\"CAMP01\",\"EventReason\":\"testing\"}",
      "attributes": {
        "ApproximateReceiveCount": "1",
        "SentTimestamp": "1523232000000",
        "SenderId": "123456789012",
        "ApproximateFirstReceiveTimestamp": "1523232000001"
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

export class Analytics extends BatchQueueOperation<typeof requestBodySchema> {
  public operationId: string = 'analytics';
  public requestBodySchema = requestBodySchema;

  public cache: CacheService;
  public notifications: NotificationsDynamoRepository;
  public campaigns: CampaignsDynamoRepository;
  public bqAnalyticsExportService: BqAnalyticsExportService;

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

    // Export event to big query export log group
    this.observability.logger.debug('Adding analytics event to big query log group', {
      NotificationID: entry.NotificationID,
      Status: entry.Event,
    });
    await this.bqAnalyticsExportService.logAnalytics(entry);

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
  bqAnalyticsExportService: iocGetBqAnalyticsExportService(),
})).handler();
