import {
  HandlerDependencies,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetEventsDynamoRepository,
  iocGetObservabilityService,
} from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { EventsDynamoRepository } from '@common/repositories';
import { CacheService, ObservabilityService } from '@common/services';
import { ConfigurationService } from '@common/services/configurationService';
import { groupValidation } from '@common/utils';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { Context } from 'aws-lambda';

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
export class Analytics extends QueueHandler<IAnalytics, void> {
  public operationId: string = 'analytics';
  public cache: CacheService;
  public events: EventsDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<Analytics>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  public async implementation(event: QueueEvent<IAnalytics>, context: Context) {
    // Validate individual records
    const [records, validRecords, invalidRecords] = groupValidation(
      event.Records.map((record) => record.body),
      IAnalyticsSchema
    );

    // A single invalid entry rejects entire batch - these are messages from within the system this should not happen
    if (invalidRecords.length > 0) {
      this.observability.logger.error(`Invalid elements detected within the SQS Message, omitting those`, {
        invalidRecords: invalidRecords.map((record) => record.raw),
        errors: invalidRecords.map((record) => record.errors),
        totalRecords: records,
      });
    }

    // Map SQS Records to analytics entries
    const entries = validRecords
      .map(({ valid }) => valid)
      .filter((record) => record !== undefined) satisfies IAnalytics[];
    const createEntriesMeta = {
      NotificationIDs: entries.map(({ NotificationID }) => NotificationID),
    };

    if (entries.length > 0) {
      this.observability.logger.info(`Creating entries in batch`, createEntriesMeta);
      await this.events.createRecordBatch(entries);
      this.observability.logger.info(`Completes saving entries in batch`, createEntriesMeta);
    }

    // For each updated row - also update the redis cache
    for (const notification of entries) {
      const cacheKey = `/${notification.DepartmentID}/${notification.NotificationID}/Status`;
      await this.cache.store(cacheKey, notification.Event);
      this.observability.logger.info(`Updating Elasticache with notification status`, {
        NotificationID: notification.NotificationID,
        Status: notification.Event,
      });
    }
  }
}

export const handler = new Analytics(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  events: iocGetEventsDynamoRepository(),
  cache: iocGetCacheService().connect(),
})).handler();
