import { QueueEvent, QueueHandler } from '@common';
import { Context } from 'aws-lambda';

export class Validation extends QueueHandler {
  public operationId: string = 'validation';

  constructor() {
    super();
  }

  public async implementation(
    event: QueueEvent,
    context: Context
  ) {
    this.logger.trace('Lambda triggered');
  }
}

export const handler = new Validation().handler();
