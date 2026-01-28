import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIMessageRecord } from '@common/builders/toIMessageRecord';
import {
  iocGetAnalyticsQueueService,
  iocGetInboundDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetProcessingQueueService,
  iocGetTracer,
} from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { IMessage, IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Context } from 'aws-lambda';

export class Validation extends QueueHandler<unknown> {
  public operationId: string = 'validation';

  constructor(logger: Logger, metrics: Metrics, tracer: Tracer) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<unknown>, context: Context) {
    this.logger.info('Received request');

    // ioc
    const messageRecordTable = await iocGetInboundDynamoRepository();
    const processingQueue = await iocGetProcessingQueueService();
    const analyticsQueue = await iocGetAnalyticsQueueService();

    // Validation
    const messageRecords: IMessageRecord[] = [];
    const partialMessageRecords: IMessageRecord[] = [];

    // Segregate inputs - parse all, group by result, for invalid record - parse using partial approach to extract valid fields
    this.logger.info(event.Records[0].body as string);
    const records = event.Records.map((record) => [record, IMessageSchema.safeParse(record.body)] as const);
    const validRecords = records
      .filter(([, parseResult]) => parseResult.success == true)
      .map(([record, parseResult]) => [record, parseResult.data as IMessage] as const);
    const invalidRecords = records
      .filter(([, parseResult]) => parseResult.success == false)
      .map(([record]) => [record, IMessageSchema.partial().safeParse(record.body)] as const);

    this.logger.info(`There are ${validRecords.length} valid records.`);
    this.logger.info(`There are ${invalidRecords.length} invalid records.`);

    // Store success entries
    for (const [validRecord, data] of validRecords) {
      const record = toIMessageRecord(
        {
          recordFields: data,
          receivedDateTime: new Date(validRecord.attributes.ApproximateFirstReceiveTimestamp),
          validatedDateTime: new Date(),
        },
        this.logger
      );

      if (record) {
        messageRecords.push(record);
      }
    }

    // Store failed entries
    for (const [invalidRecord, { data }] of invalidRecords) {
      if (data == undefined) {
        continue;
      }

      const record = toIMessageRecord(
        {
          recordFields: data,
          receivedDateTime: new Date(invalidRecord.attributes.ApproximateFirstReceiveTimestamp),
        },
        this.logger
      );

      if (record) {
        partialMessageRecords.push(record);
      }
    }

    // Requeue validated messages to the processing queue
    const messagesToPass = validRecords.map(([, data]) => data);

    if (messagesToPass.length > 0) {
      this.logger.info('Requeuing validated message to process queue');
      await processingQueue.publishMessageBatch(messagesToPass);
    }

    // Create a record of message in Dynamodb
    if (messagesToPass.length > 0) {
      this.logger.info('Creating record of validated messages that have been passed to queue.');
      await messageRecordTable.createRecordBatch(messageRecords);
    }

    if (partialMessageRecords.length > 0) {
      this.logger.info('Creating record of messages that failed validation.');
      await messageRecordTable.createRecordBatch(partialMessageRecords);
    }

    // (MOCK) Send event to events queue

    this.logger.info('Queuing events to analytics queue.');
    await analyticsQueue.publishMessage('Test message body.');

    this.logger.info('Completed request');
  }
}

export const handler = new Validation(iocGetLogger(), iocGetMetrics(), iocGetTracer()).handler();
