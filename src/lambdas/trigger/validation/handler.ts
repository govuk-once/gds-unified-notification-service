import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetConfigurationService, iocGetLogger, iocGetMetrics, iocGetQueueService, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { Context } from 'aws-lambda';

export class Validation extends QueueHandler<unknown, void> {
  public operationId: string = 'validation';

  constructor(
    protected config: Configuration,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<string>, context: Context) {
    this.logger.info('Received request');

    // (MOCK) Send validated Message to valid queue
    const validationQueueUrl = (await this.config.getParameter('queue/valid', 'url')) ?? '';

    const validationQueue = iocGetQueueService(validationQueueUrl);
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

    const eventsQueue = iocGetQueueService(eventsQueueUrl);
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
  }
}

export const handler = new Validation(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
