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

    // (MOCK) Send completed message to push notification endpoint
    this.logger.info('Message sent.');
    this.logger.info('Completed request.');

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter('queue/analytics', 'url')) ?? '';

    const analyticsQueue = iocGetQueueService(analyticsQueueUrl);
    await analyticsQueue.publishMessage(
      {
        Title: {
          DataType: 'String',
          StringValue: 'From dispatch lambda',
        },
      },
      'Test message body.'
    );
  }
}

export const handler = new Dispatch(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
