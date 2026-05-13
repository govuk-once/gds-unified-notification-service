import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
import { PartialItemFailureResponse } from '@aws-lambda-powertools/batch/types';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { NotificationsDynamoRepository } from '@common/repositories';
import { CacheService, MetricsLabels, ObservabilityService } from '@common/services';
import { ConfigurationService } from '@common/services/configurationService';
import { BoolParameters, groupValidation } from '@common/utils';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { Context, SQSRecord } from 'aws-lambda';
import z from 'zod';

/**
 * Lambda handling storing analytics events into the dedicated events DynamoDB Table, it also updates cache keys within elasticache
 * Sample event:
 {
  "Records": [
    {
      "messageId": "19dd0b57-b21e-4ac1-bd88-01bbb068cb78",
      "receiptHandle": "MessageReceiptHandle",
      "body": "{\"DepartmentID\":\"TEST01\",\"NotificationID\":\"not1\",\"Event\":\"VALIDATED\",\"EventDateTime\":\"2026-01-22T00:00:01Z\",\"APIGWExtendedID\":\"testExample\",\"EventReason\":\"testing\"}",
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
export class Analytics extends QueueHandler<IAnalytics, PartialItemFailureResponse> {
  public operationId: string = 'analytics';
  public cache: CacheService;
  public notifications: NotificationsDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<Analytics>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  public recordHandler = async (record: SQSRecord) => {
    // Validate Incoming Analytics events
    const parsing = await IAnalyticsSchema.safeParseAsync(record.body);
    if (!parsing.success) {
      this.observability.logger.error(`Failed to parse Analytics event`, z.prettifyError(parsing.error));
      throw new Error(`Failed to parse Analytics Event`);
    }

    // Map SQS Records to analytics entries
    const entry = parsing.data;

    // Update notification object with status event
    await this.notifications.addEvent(entry);

    // For each updated row - also update the redis cache
    const cacheKey = `/${entry.DepartmentID}/${entry.NotificationID}/Status`;
    await this.cache.store(cacheKey, entry.Event);
    this.observability.logger.info(`Updating Elasticache with notification status`, {
      NotificationID: entry.NotificationID,
      Status: entry.Event,
    });
  };

  public async implementation(event: QueueEvent<IAnalytics>, context: Context): Promise<PartialItemFailureResponse> {
    const processor = new BatchProcessor(EventType.SQS);
    const failures = await processPartialResponse(event, this.recordHandler, processor, {
      context,
    });

    if (failures.batchItemFailures.length > 0) {
      this.observability.metrics.addMetric(
        MetricsLabels.BATCH_ITEM_FAILURES_ANALYTICS,
        MetricUnit.Count,
        failures.batchItemFailures.length
      );
    }
    return failures;
  }
}

export const handler = new Analytics(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  cache: iocGetCacheService().connect(),
  notifications: iocGetNotificationDynamoRepository(),
})).handler();
