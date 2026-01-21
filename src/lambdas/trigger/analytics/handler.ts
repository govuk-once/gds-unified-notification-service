import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIAnalyticsRecord } from '@common/builders/toIAnalyticsRecord';
import {
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetQueueService,
  iocGetTracer,
} from '@common/ioc';
import { IAnalyticsRecord } from '@common/models/interfaces/IAnalyticsRecord';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { StringParameters } from '@common/utils/parameters';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { Context } from 'aws-lambda';

export class Analytics extends QueueHandler<unknown, void> {
  public operationId: string = 'analytics';

  constructor(
    protected config: Configuration,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<string>, context: Context) {
    this.logger.info('Received request.');

    const cacheService = iocGetCacheService();
    const analyticsRecordTable = iocGetDynamoRepository('events');
    const processingQueueUrl = (await this.config.getParameter(StringParameters.Queue.Processing.Url)) ?? '';
    const processingQueue = iocGetQueueService(processingQueueUrl);

    const validmessagesToForward: IAnalytics[] = [];
    const dbRecordsToCreate: IAnalyticsRecord[] = [];
    const cacheUpdatePromises: Promise<unknown>[] = [];

    const records = event.Records.map((record) => ({
      raw: record,
      parseResult: IAnalyticsSchema.safeParse(record.body),
    }));

    const validRecords = records.filter((record) => record.parseResult.success);

    for (const { parseResult } of validRecords) {
      const data = parseResult.data as IAnalytics;

      validmessagesToForward.push(data);

      const cacheKey = `/${data.DepartmentID}/${data.NotificationID}/Status`;

      cacheUpdatePromises.push(cacheService.store(cacheKey, ValidationEnum.PROCESSING));

      const record = toIAnalyticsRecord(data, Date.now().toString());

      if (record) {
        dbRecordsToCreate.push(record);
      }

      const invalidRecords = records.filter((record) => !record.parseResult.success);

      for (const { raw } of invalidRecords) {
        const partialParse = IAnalyticsSchema.partial().safeParse(raw.body);

        if (partialParse.success && partialParse.data) {
          const data = partialParse.data;

          if (data.DepartmentID && data.NotificationID) {
            const cacheKey = `/${data.DepartmentID}/${data.NotificationID}/Status`;

            cacheUpdatePromises.push(cacheService.store(cacheKey, ValidationEnum.READ));
          }

          const record = toIAnalyticsRecord(data as IAnalytics, Date.now().toString());

          if (record) {
            dbRecordsToCreate.push(record);
          }
        }
      }

      if (validmessagesToForward.length > 0) {
        this.logger.trace(`Requeuing ${validmessagesToForward.length} validated messages.`);

        await processingQueue.publishMessageBatch<IAnalytics>(validmessagesToForward);
      }

      if (dbRecordsToCreate.length > 0) {
        this.logger.trace(`Persisting ${dbRecordsToCreate.length} event records to dynamoDB.`);

        await analyticsRecordTable.createRecordBatch<IAnalyticsRecord>(dbRecordsToCreate);
      }

      if (cacheUpdatePromises.length > 0) {
        this.logger.trace(`Updating status cache for ${cacheUpdatePromises.length} items.`);
        await Promise.all(cacheUpdatePromises);
      }

      this.logger.info('Completed request.');
    }
  }
}

export const handler = new Analytics(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
