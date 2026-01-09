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

  public async implementation(event: QueueEvent<unknown>, context: Context) {
    this.logger.info('Received request');

    const validationQueueUrl = await this.config.getParameter('queue', 'validation/url');
    if (!validationQueueUrl) {
      throw new Error('Validation Queue Url is not set.');
    }

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
    this.logger.info('Completed request');
  }
}

export const handler = new Validation().handler();
