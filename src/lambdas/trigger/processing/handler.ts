import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { QueueService } from '@common/services/queueService';
import { Context } from 'aws-lambda';

export class Processing extends QueueHandler<unknown, void> {
  private config: Configuration = new Configuration();
  public operationId: string = 'processing';

  constructor() {
    super();
  }

  public async implementation(event: QueueEvent<unknown>, context: Context) {
    this.logger.info('Received request');

    const processingQueueUrl = (await this.config.getParameter('queue/processing', 'url')) ?? '';

    const processingQueue = new QueueService(processingQueueUrl);
    await processingQueue.publishMessage(
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

export const handler = new Processing().handler();
