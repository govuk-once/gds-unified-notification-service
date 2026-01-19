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
    this.logger.trace('Received request');

    // Validation
    const incomingMessages: IMessage[] = [];
    const messageRecords: IMessageRecord[] = [];

    event.Records.forEach((eventRecord) => {
      const y = IMessageSchema.safeParse(eventRecord.body);

      if (y.success) {
        this.logger.trace('Successfully parsed message body');

        const message = y.data;
        incomingMessages.push(message);

        const record = {
          NotificationID: message.NotificationID,
          UserID: message.UserID,
          MessageTitle: message.MessageTitle,
          MessageBody: message.MessageBody,
          NotificationTitle: message.NotificationTitle,
          NotificationBody: message.NotificationBody,
          DepartmentID: message.DepartmentID,
          ReceivedDateTime: eventRecord.attributes.ApproximateFirstReceiveTimestamp,
          ValidatedDateTime: Date.now().toString(),
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
            ReceivedDateTime: eventRecord.attributes.ApproximateFirstReceiveTimestamp,
          };

          if (failedMessage.MessageTitle) {
            record.MessageTitle = failedMessage.MessageTitle;
          }
          if (failedMessage.MessageBody) {
            record.MessageBody = failedMessage.MessageBody;
          }
          if (failedMessage.NotificationTitle) {
            record.NotificationTitle = failedMessage.NotificationTitle;
          }
          if (failedMessage.NotificationBody) {
            record.NotificationBody = failedMessage.NotificationBody;
          }
          if (failedMessage.DepartmentID) {
            record.DepartmentID = failedMessage.DepartmentID;
          }

          messageRecords.push(record);
        } else {
          this.logger.error('Validation failed with no NotificationID provided', y.error);
        }
      }
    });

    // Passing to Queue
    if (incomingMessages.length > 0) {
      const processingQueueUrl = (await this.config.getParameter(StringParameters.Queue.Processing.Url)) ?? '';
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
      const messageRecordTableName =
        (await this.config.getParameter(StringParameters.Table.IncomingMessage.Name)) ?? '';
      const messageRecordTable = iocGetDynamoRepository(messageRecordTableName);

      await Promise.all(
        messageRecords.map(async (record) => {
          await messageRecordTable.createRecord<IMessageRecord>(record);
        })
      );
    }

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter(StringParameters.Queue.Analytics.Url)) ?? '';
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
