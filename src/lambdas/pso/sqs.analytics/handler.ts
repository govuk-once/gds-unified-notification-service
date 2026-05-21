import { PartialItemFailureResponse } from '@aws-lambda-powertools/batch/types';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetCacheService,
  iocGetCampaignsDynamoRepository,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { CampaignsDynamoRepository, NotificationsDynamoRepository } from '@common/repositories';
import { CacheService, MetricsLabels, ObservabilityService } from '@common/services';
import { ConfigurationService } from '@common/services/configurationService';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { SQSRecord } from 'aws-lambda';
import z from 'zod';

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
export class Analytics extends BatchQueueOperation<IAnalytics> {
  public operationId: string = 'analytics';
  public cache: CacheService;
  public notifications: NotificationsDynamoRepository;
  public campaigns: CampaignsDynamoRepository;

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
    const entry = await this.validateAnalyticsRecord(record);

    // Update notification object with status event
    await this.notifications.addEvent(entry);

    // Increments campaign
    if (entry.CampaignID) {
      this.observability.logger.info(`Increment CampaignID: ${entry.CampaignID}`);
      await this.campaigns.incrementCampaigns(entry.CampaignID, entry.DepartmentID, entry.Event);
    }

    // For each updated row - also update the redis cache
    const cacheKey = `/${entry.DepartmentID}/${entry.NotificationID}/Status`;
    await this.cache.store(cacheKey, entry.Event);
    this.observability.logger.info(`Updating Elasticache with notification status`, {
      NotificationID: entry.NotificationID,
      Status: entry.Event,
    });
  };

  protected batchItemFailureMetric = (batchItemFailuresCount: number) => {
    this.observability.metrics.addMetric(
      MetricsLabels.BATCH_ITEM_FAILURES_ANALYTICS,
      MetricUnit.Count,
      batchItemFailuresCount
    );
  };
}

export const handler = new Analytics(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  cache: iocGetCacheService().connect(),
  notifications: iocGetNotificationDynamoRepository(),
  campaigns: iocGetCampaignsDynamoRepository(),
})).handler();
