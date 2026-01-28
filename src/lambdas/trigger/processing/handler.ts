import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIMessageRecord } from '@common/builders/toIMessageRecord';
import {
  iocGetAnalyticsQueueService,
  iocGetDispatchQueueService,
  iocGetInboundDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetTracer,
} from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import { Context } from 'aws-lambda';

export class Processing extends QueueHandler<IMessage, void> {
  public operationId: string = 'processing';

  constructor(logger: Logger, metrics: Metrics, tracer: Tracer) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<IMessage>, context: Context) {
    this.logger.info('Received request.');

    // ioc
    const dispatchQueue = await iocGetDispatchQueueService();
    const messageRecordTable = await iocGetInboundDynamoRepository();
    const analyticsQueue = await iocGetAnalyticsQueueService();

    // (MOCK) Getting the OneSignalID from UDP
    const processedMessages = event.Records.map((x) => {
      const processedMessage: IProcessedMessage = {
        ...x.body,
        ExternalUserID: `OneSignal-${x.body.NotificationID}`,
      };
      return processedMessage;
    });

    // TODO: Will need to handle failed requests

    // Store success entries
    const messageRecords: IMessageRecord[] = [];
    for (const message of processedMessages) {
      const record = toIMessageRecord(
        {
          recordFields: {
            NotificationID: message.NotificationID,
            ExternalUserID: message.ExternalUserID,
          },
          processedDateTime: new Date(),
        },
        this.logger
      );

      if (record) {
        messageRecords.push(record);
      }
    }

    // Requeue processed messages to the dispatch queue
    this.logger.info('Publishing processed messages to dispatch queue.');
    await dispatchQueue.publishMessageBatch(processedMessages);

    // Update record of message in Dynamodb
    this.logger.info('Updating record of processed messages that have been passed to queue.');
    await Promise.all(messageRecords.map((record) => messageRecordTable.updateRecord(record)));

    // (MOCK) Send event to events queue
    await analyticsQueue.publishMessage('Test message body.');
    this.logger.info('Completed request.');
  }
}

export const handler = new Processing(iocGetLogger(), iocGetMetrics(), iocGetTracer()).handler();
