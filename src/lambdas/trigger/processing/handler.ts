import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetConfigurationService, iocGetLogger, iocGetMetrics, iocGetQueueService, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Context } from 'aws-lambda';

export class Processing extends QueueHandler<string, void> {
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
    this.logger.trace('Received request.');

    // (MOCK) Send processed message to completed queue
    const dispatchQueueUrl = (await this.config.getParameter('queue/dispatch', 'url')) ?? '';
    const dispatchQueue = iocGetQueueService(dispatchQueueUrl);

    await dispatchQueue.publishMessage(
      {
        Title: {
          DataType: 'String',
          StringValue: 'Test Message',
        },
      },
      'Test message body.'
    );

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter('queue/analytics', 'url')) ?? '';
    const analyticsQueue = iocGetQueueService(analyticsQueueUrl);

    await analyticsQueue.publishMessage(
      {
        Title: {
          DataType: 'String',
          StringValue: 'From processing lambda',
        },
      },
      'Test message body.'
    );

    this.logger.trace('Completed request.');
  }
}

export const handler = new Processing(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
