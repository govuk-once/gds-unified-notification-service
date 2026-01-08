import { QueueEvent, QueueHandler } from '@common/operations';
import { QueueService } from '@common/services/queueService';
import { Context } from 'aws-lambda';

export class Validation extends QueueHandler<unknown, void> {
  public operationId: string = 'validation';

  constructor() {
    super();
  }

  public async implementation(event: QueueEvent<unknown>, context: Context) {
    this.logger.info('Received request');

    const validationQueue = new QueueService(
      'https://sqs.eu-west-2.amazonaws.com/674663567518/gdpuns-toby-ec10-sqs-validateMessage'
    ); //TODO: Made queue url a parameter
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
