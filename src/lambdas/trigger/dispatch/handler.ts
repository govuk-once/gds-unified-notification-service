import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetAnalyticsQueueService, iocGetLogger, iocGetMetrics, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Context } from 'aws-lambda';

export class Dispatch extends QueueHandler<unknown, void> {
  public operationId: string = 'dispatch';

  constructor(logger: Logger, metrics: Metrics, tracer: Tracer) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<string>, context: Context) {
    this.logger.info('Received request.');

    // ioc
    const analyticsQueue = await iocGetAnalyticsQueueService();

    // (MOCK) Send completed message to push notification endpoint
    this.logger.info('Message sent.');
    this.logger.info('Completed request.');

    // (MOCK) Send event to events queue
    await analyticsQueue.publishMessage('Test message body.');
  }
}

export const handler = new Dispatch(iocGetLogger(), iocGetMetrics(), iocGetTracer()).handler();
