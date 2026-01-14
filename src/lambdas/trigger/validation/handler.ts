import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { QueueService } from '@common/services/queueService';
import { Context } from 'aws-lambda';

export class Validation extends QueueHandler<unknown, void> {
  private config: Configuration = new Configuration();
  public operationId: string = 'validation';

  constructor() {
    super();
  }

  public async implementation(event: QueueEvent<string>, context: Context) {
    this.logger.info('Received request');

    if (event.Records[0].messageId && event.Records[0].body) {
      // (MOCK) Send validated Message to valid queue
      const validationQueueUrl = (await this.config.getParameter('queue/valid', 'url')) ?? '';

      const validationQueue = new QueueService(validationQueueUrl);
      await validationQueue.publishMessage(
        {
          Title: {
            DataType: 'String',
            StringValue: 'Test Message',
          },
        },
        'Test message body.'
      );

      // (MOCK) Send event to events queue
      const eventsQueueUrl = (await this.config.getParameter('queue/events', 'url')) ?? '';

      const eventsQueue = new QueueService(eventsQueueUrl);
      await eventsQueue.publishMessage(
        {
          Title: {
            DataType: 'String',
            StringValue: 'From validation lambda',
          },
        },
        'Test message body.'
      );

      this.logger.info('Completed request');
    } else {
      this.logger.info('Completed request with no actions.');
    }
  }
}

export const handler = new Validation().handler();
