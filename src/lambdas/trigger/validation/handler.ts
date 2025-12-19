
import { QueueEvent, QueueHandler } from '@common/operations';
import { Context } from 'aws-lambda';

export class Validation extends QueueHandler<unknown, void> {
  public operationId: string = 'validation';

  constructor() {
    super();
  }

  public async implementation(
    event: QueueEvent<unknown>,
    context: Context
  ) {
    this.logger.trace('Lambda triggered');
  }
}

export const handler = new Validation().handler();
