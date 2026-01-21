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
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import { Context } from 'aws-lambda';

export class Processing extends QueueHandler<IMessage, void> {
  public operationId: string = 'processing';

  constructor(
    protected config: Configuration,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<IMessage>, context: Context) {
    this.logger.info('Received request.');

    const messageRecords: IMessageRecord[] = [];

    // (MOCK) Getting the OneSignalID from UDP
    const processedMessages = event.Records.map((x) => {
      const processedMessage: IProcessedMessage = {
        ...x.body,
        OneSignalID: `OneSignal-${x.body.NotificationID}`,
      };
      return processedMessage;
    });

    // Store success entries
    for (const message of processedMessages) {
      const record = toIMessageRecord({
        recordFields: {
          NotificationID: message.NotificationID,
          OneSignalID: message.OneSignalID,
        },
        processedDateTime: Date.now().toString(),
      });
      messageRecords.push(record);
    }

    // Requeue processed messages to the dispatch queue
    const dispatchQueueUrl = (await this.config.getParameter(StringParameters.Queue.Dispatch.Url)) ?? '';
    const dispatchQueue = iocGetQueueService(dispatchQueueUrl);

    this.logger.info('Publishing processed messages to dispatch queue.');
    await dispatchQueue.publishMessageBatch(processedMessages);

    // Update record of message in Dynamodb
    const messageRecordTableName = (await this.config.getParameter(StringParameters.Table.Inbound.Name)) ?? '';
    const messageRecordTableKey = (await this.config.getParameter(StringParameters.Table.Inbound.Key)) ?? '';
    const messageRecordTable = iocGetDynamoRepository(messageRecordTableName, messageRecordTableKey);

    this.logger.info('Updating record of processed messages that have been passed to queue.');
    // TODO: Refactor this section
    await Promise.all(
      messageRecords.map(async (x) => {
        await messageRecordTable.updateRecord<IMessageRecord>(x.NotificationID, x);
      })
    );

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter(StringParameters.Queue.Analytics.Url)) ?? '';

    const analyticsQueue = iocGetQueueService(analyticsQueueUrl);
    await analyticsQueue.publishMessage('Test message body.');

    this.logger.info('Completed request.');
  }
}

export const handler = new Processing(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
