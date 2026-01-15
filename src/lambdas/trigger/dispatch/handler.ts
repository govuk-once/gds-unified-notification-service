import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetConfigurationService, iocGetLogger, iocGetMetrics, iocGetQueueService, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { Context } from 'aws-lambda';

export class Dispatch extends QueueHandler<unknown, void> {
  public operationId: string = 'dispatch';

  constructor(
    protected config: Configuration,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<string>, context: Context) {
    this.logger.info('Received request.');

    if (event.Records[0].messageId && event.Records[0].body) {
      // (MOCK) Send completed message to push notification endpoint
      this.logger.info('Message sent.');
      this.logger.info('Completed request.');

      // (MOCK) Send event to events queue
      const eventsQueueUrl = (await this.config.getParameter('queue/events', 'url')) ?? '';

      const eventsQueue = iocGetQueueService(eventsQueueUrl);
      await eventsQueue.publishMessage(
        {
          Title: {
            DataType: 'String',
            StringValue: 'From dispatch lambda',
          },
        },
        'Test message body.'
      );
    } else {
      this.logger.info('Completed request with no actions.');
    }
  }
}

export const handler = new Dispatch(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
