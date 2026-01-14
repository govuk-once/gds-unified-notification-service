import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { Context } from 'aws-lambda';

export class Analytics extends QueueHandler<unknown, void> {
  private config: Configuration = new Configuration();
  public operationId: string = 'analytics';

  constructor() {
    super();
  }

  public async implementation(event: QueueEvent<string>, context: Context) {
    this.logger.info('Received request.');

    if (event.Records[0].messageId && event.Records[0].body) {
      // (MOCK) Send event to events table
      const eventsTableName = (await this.config.getParameter('table/events', 'name')) ?? '';
      this.logger.info(`Received Record from ${event.Records[0].messageAttributes['Title'].stringValue}.`);

      this.logger.info('Sent Record.');
      this.logger.info('Completed request.');
    } else {
      this.logger.info('Completed request with no actions.');
    }
  }
}

export const handler = new Analytics().handler();
