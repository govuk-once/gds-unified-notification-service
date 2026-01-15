import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetConfigurationService, iocGetLogger, iocGetMetrics, iocGetQueueService, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { Context } from 'aws-lambda';

export class Processing extends QueueHandler<unknown, void> {
  public operationId: string = 'processing';

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

    // (MOCK) Send processed message to completed queue
    const processingQueueUrl = (await this.config.getParameter('queue/complete', 'url')) ?? '';

    const processingQueue = iocGetQueueService(processingQueueUrl);
    await processingQueue.publishMessage(
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
          StringValue: 'From processing lambda',
        },
      },
      'Test message body.'
    );

    this.logger.info('Completed request.');
  }
}

export const handler = new Processing(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
