import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
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
import { IMessage, IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { Key } from '@project/lambdas/namespaces/KeyEnum';
import { Namespace } from '@project/lambdas/namespaces/NamespaceEnum';
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
    this.logger.trace('Received request');

    // Validation
    const incomingMessages: IMessage[] = [];
    const messageRecords: IMessageRecord[] = [];

    event.Records.forEach((eventRecord) => {
      const y = IMessageSchema.safeParse(eventRecord.body);

      if (y.success) {
        this.logger.trace('Successfully parsed message body');
        console.log('Successfully parsed message body');

        const message = y.data;
        incomingMessages.push(message);

        const record = {
          NotificationID: message.NotificationID,
          UserID: message.UserID,
          MessageTitle: message.MessageTitle,
          MessageBody: message.MessageBody,
          MessageTitleFull: message.MessageTitleFull,
          MessageBodyFull: message.MessageBodyFull,
          DepartmentID: message.DepartmentID,
          ReceivedDateTime: eventRecord.attributes.ApproximateFirstReceiveTimestamp,
          ValidatedDateTime: Date.now().toString(),
          ProcessedDateTime: undefined,
          SentDateTime: undefined,
          DispatchedStartDateTime: undefined,
          OneSignalID: undefined,
          APIGWExtendedID: undefined,
          OneSignalResponseID: undefined,
          TraceID: undefined,
        };
        messageRecords.push(record);
      } else {
        const failedMessage = eventRecord.body as Partial<IMessage>;

        if (failedMessage?.NotificationID && failedMessage?.UserID) {
          this.logger.trace(`Failed to parse message body with NotificationID:${failedMessage?.NotificationID}`);
          console.log(`Failed to parse message body with NotificationID:${failedMessage?.NotificationID}`);

          const record: IMessageRecord = {
            NotificationID: failedMessage.NotificationID,
            UserID: failedMessage.UserID,
            OneSignalID: undefined,
            APIGWExtendedID: undefined,
            MessageTitle: failedMessage.MessageTitle,
            MessageBody: failedMessage.MessageBody,
            MessageTitleFull: failedMessage.MessageTitleFull,
            MessageBodyFull: failedMessage.MessageBodyFull,
            DepartmentID: failedMessage.DepartmentID,
            ReceivedDateTime: eventRecord.attributes.ApproximateFirstReceiveTimestamp,
            ValidatedDateTime: undefined,
            ProcessedDateTime: undefined,
            DispatchedStartDateTime: undefined,
            OneSignalResponseID: undefined,
            SentDateTime: undefined,
            TraceID: undefined,
          };

          messageRecords.push(record);
        } else {
          this.logger.error('Validation failed with no NotificationID provided', y.error);
        }
      }
    });

    // Passing to Queue
    if (incomingMessages.length > 0) {
      const processingQueueUrl = (await this.config.getParameter(Namespace.ProcessingQueue, Key.Url)) ?? '';
      console.log('Called getParameter');

      const processingQueue = iocGetQueueService(processingQueueUrl);

      await processingQueue.publishMessageBatch<IMessage>(
        incomingMessages.map((message) => {
          return [
            {
              Title: {
                DataType: 'String',
                StringValue: 'Test title',
              },
            },
            message,
          ];
        })
      );
    }

    // Create a record of message in Dynamodb
    if (messageRecords.length > 0) {
      const messageRecordTableName = (await this.config.getParameter(Namespace.IncomingMessageTable, Key.Name)) ?? '';
      console.log('Called getParameter');

      const messageRecordTable = iocGetDynamoRepository(messageRecordTableName);

      await Promise.all(
        messageRecords.map(async (record) => {
          await messageRecordTable.createRecord<IMessageRecord>(record);
        })
      );
    }

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter(Namespace.AnalyticsQueue, Key.Url)) ?? '';
    console.log('Called getParameter');

    const analyticsQueue = iocGetQueueService(analyticsQueueUrl);

    await analyticsQueue.publishMessage(
      {
        Title: {
          DataType: 'String',
          StringValue: 'From validation lambda',
        },
      },
      'Test message body.'
    );

    this.logger.trace('Completed request');
  }
}

export const handler = new Validation(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
