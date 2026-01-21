import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIMessageRecord } from '@common/builders/IMessageRecord';
import {
  iocGetConfigurationService,
  iocGetDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetQueueService,
  iocGetTracer,
} from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { StringParameters } from '@common/utils/parameters';
import { IMessage, IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Context } from 'aws-lambda';

export class Validation extends QueueHandler<unknown> {
  public operationId: string = 'validation';

  constructor(
    protected config: Configuration,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<unknown>, context: Context) {
    this.logger.info('Received request');

    // Validation
    const messageRecords: IMessageRecord[] = [];
    const partialMessageRecords: IMessageRecord[] = [];

    // Segregate inputs - parse all, group by result, for invalid record - parse using partial approach to extract valid fields
    const records = event.Records.map((record) => [record, IMessageSchema.safeParse(record.body)] as const);
    const validRecords = records
      .filter(([, parseResult]) => parseResult.success == true)
      .map(([record, parseResult]) => [record, parseResult.data as IMessage] as const);
    const invalidRecords = records
      .filter(([, parseResult]) => parseResult.success == false)
      .map(([record]) => [record, IMessageSchema.partial().safeParse(record.body)] as const);

    // Store success entries
    for (const [validRecord, data] of validRecords) {
      const record = toIMessageRecord({
        recordFields: data,
        receivedDateTime: validRecord.attributes.ApproximateFirstReceiveTimestamp,
        validatedDateTime: Date.now().toString(),
      });
      messageRecords.push(record);
    }

    // Store failed entries
    for (const [invalidRecord, { data }] of invalidRecords) {
      if (data == undefined) {
        continue;
      }

      try {
        const record = toIMessageRecord({
          recordFields: data,
          receivedDateTime: invalidRecord.attributes.ApproximateFirstReceiveTimestamp,
        });
        partialMessageRecords.push(record);
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(error.message);
        } else {
          throw error;
        }
      }
    }

    // Requeue validated messages to the processing queue
    const messagesToPass = validRecords.map(([, data]) => data);

    if (messagesToPass.length > 0) {
      const processingQueueUrl = (await this.config.getParameter(StringParameters.Queue.Processing.Url)) ?? '';
      const processingQueue = iocGetQueueService(processingQueueUrl);

      this.logger.info('Requeuing validated message to process queue');
      await processingQueue.publishMessageBatch<IMessage>(messagesToPass);
    }

    // Create a record of message in Dynamodb
    const messageRecordTableName = (await this.config.getParameter(StringParameters.Table.Inbound.Name)) ?? '';
    const messageRecordTableKey = (await this.config.getParameter(StringParameters.Table.Inbound.Key)) ?? '';
    const messageRecordTable = iocGetDynamoRepository(messageRecordTableName, messageRecordTableKey);

    if (messagesToPass.length > 0) {
      this.logger.info('Creating record of validated messages that have been passed to queue.');
      await messageRecordTable.createRecordBatch<IMessageRecord>(messageRecords);
    }

    if (partialMessageRecords.length > 0) {
      this.logger.info('Creating record of messages that failed validation.');
      await messageRecordTable.createRecordBatch<IMessageRecord>(partialMessageRecords);
    }

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter(StringParameters.Queue.Analytics.Url)) ?? '';
    const analyticsQueue = iocGetQueueService(analyticsQueueUrl);

    await analyticsQueue.publishMessage('Test message body.');

    this.logger.info('Completed request');
  }
}
export const handler = new Validation(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
