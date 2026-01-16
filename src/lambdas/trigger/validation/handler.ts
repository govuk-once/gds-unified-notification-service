import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  iocGetConfigurationService,
  //iocGetDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetQueueService,
  iocGetTracer,
} from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { IStoreMessageRepository } from '@common/repositories/interfaces/IStoreMessageRepository';
import { Configuration } from '@common/services/configuration';
import { IMessage, IMessageRecord, IMessageSchema } from '@project/lambdas/interfaces/ITriggerValidation';
import { Context } from 'aws-lambda';
import z from 'zod';

export class Validation extends QueueHandler<unknown> {
  public operationId: string = 'validation';

  constructor(
    protected config: Configuration,
    //protected dynamoRepo: IStoreMessageRepository,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<unknown>, context: Context) {
    this.logger.info('Received request');

    // Validation
    const incomingMessages: IMessage[] = [];
    const messageRecords: IMessageRecord[] = [];

    event.Records.forEach((x) => {
      const y = IMessageSchema.safeParse(x.body);

      if (y.success) {
        const message = y.data;
        incomingMessages.push(message);

        const record = {
          NotificationID: message.NotificationID,
          UserID: message.UserID,
          MessageTitle: message.MessageTitle,
          MessageBody: message.MessageTitle,
          MessageTitleFull: message.MessageTitle,
          MessageBodyFull: message.MessageTitle,
          DepartmentID: message.MessageTitle,
          ReceivedDateTime: x.attributes.ApproximateFirstReceiveTimestamp,
          ValidatedDateTime: Date.now().toString(),
        };
        messageRecords.push(record);
      } else {
        const failedMessage = x.body as Partial<IMessage>;

        if (failedMessage?.NotificationID && failedMessage?.UserID) {
          const record: IMessageRecord = {
            NotificationID: failedMessage.NotificationID,
            UserID: failedMessage.UserID,
          };

          if (failedMessage.MessageTitle) record.MessageTitle = failedMessage.MessageTitle;
          if (failedMessage.MessageBody) record.MessageBody = failedMessage.MessageBody;
          if (failedMessage.MessageTitleFull) record.MessageTitleFull = failedMessage.MessageTitleFull;
          if (failedMessage.MessageBodyFull) record.MessageBodyFull = failedMessage.MessageBodyFull;
          if (x.attributes.ApproximateFirstReceiveTimestamp)
            record.ReceivedDateTime = x.attributes.ApproximateFirstReceiveTimestamp;

          messageRecords.push(record);
        } else {
          this.logger.error('Validation failed with no NotificationID provided', y.error);
        }
      }
    });

    // Passing to Queue
    const processingQueueUrl = (await this.config.getParameter('queue/processing', 'url')) ?? '';

    const processingQueue = iocGetQueueService(processingQueueUrl);
    await processingQueue.publishMessageBatch(
      incomingMessages.map((x) => {
        return [{}, JSON.stringify(x)];
      })
    );

    // Create a record of message in Dynamodb

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter('queue/analytics', 'url')) ?? '';

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

    this.logger.info('Completed request');
  }
}

export const handler = new Validation(
  iocGetConfigurationService(),
  //iocGetDynamoRepository(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
