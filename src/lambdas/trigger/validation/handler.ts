import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetConfigurationService, iocGetLogger, iocGetMetrics, iocGetQueueService, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { IIncomingMessage, IMessage, IMessageRecord } from '@project/lambdas/interfaces/ITriggerValidation';
import { Context } from 'aws-lambda';

export class Validation extends QueueHandler<unknown, void> {
  public operationId: string = 'validation';

  constructor(
    protected config: Configuration,
    //protected dynamoService: DyanmoDbService,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<IMessage>, context: Context) {
    this.logger.info('Received request');

    // Validation
    const incomingMessages = event.Records.map((x) => {
      const y: IIncomingMessage = {
        NotificationID: x.body.NotificationID,
        UserID: x.body.UserID,
        ReceivedDateTime: x.attributes.ApproximateFirstReceiveTimestamp,
      };

      if (x.body.DepartmentID) {
        y.DepartmentID = x.body.DepartmentID;
      }
      if (x.body.MessageTitle) {
        y.MessageTitle = x.body.MessageTitle;
      }
      if (x.body.MessageBody) {
        y.MessageBody = x.body.MessageBody;
      }
      if (x.body.MessageTitleFull) {
        y.MessageTitleFull = x.body.MessageTitleFull;
      }
      if (x.body.MessageBodyFull) {
        y.MessageBodyFull = x.body.MessageBodyFull;
      }

      return y;
    });

    //await Promise.all(
    incomingMessages.map(
      (x) => {
        const incomingMessageRecord: IMessageRecord = {
          NotificationID: x.NotificationID,
          UserID: x.UserID,
          ReceivedDateTime: x.ReceivedDateTime,
        };

        if (x.DepartmentID) {
          incomingMessageRecord.DepartmentID = x.DepartmentID;
        }
        if (x.MessageTitle) {
          incomingMessageRecord.MessageTitle = x.MessageTitle;
        }
        if (x.MessageBody) {
          incomingMessageRecord.MessageBody = x.MessageBody;
        }
        if (x.MessageTitleFull) {
          incomingMessageRecord.MessageTitleFull = x.MessageTitleFull;
        }
        if (x.MessageBodyFull) {
          incomingMessageRecord.MessageBodyFull = x.MessageBodyFull;
        }

        //await dynamoService.createRecord(incomingMessageRecord);
      } //);
    );

    // Passing to Queue
    const validationQueueUrl = (await this.config.getParameter('queue/validation', 'url')) ?? '';

    const validationQueue = iocGetQueueService(validationQueueUrl);
    await validationQueue.publishMessageBatch(
      incomingMessages.map((x) => {
        const message: IMessage = {
          NotificationID: x.NotificationID,
          UserID: x.UserID,
        };

        if (x.DepartmentID) {
          message.DepartmentID = x.DepartmentID;
        }
        if (x.MessageTitle) {
          message.MessageTitle = x.MessageTitle;
        }
        if (x.MessageBody) {
          message.MessageBody = x.MessageBody;
        }
        if (x.MessageTitleFull) {
          message.MessageTitleFull = x.MessageTitleFull;
        }
        if (x.MessageBodyFull) {
          message.MessageBodyFull = x.MessageBodyFull;
        }

        return [
          {
            TestAttribute: {
              DataType: 'String',
              StringValue: 'Test Message',
            },
          },
          JSON.stringify({ ...message }),
        ];
      })
    );

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
  //iocGetDyanmoDBService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
