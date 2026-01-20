import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetConfigurationService, iocGetLogger, iocGetMetrics, iocGetQueueService, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { StringParameters } from '@common/utils/parameters';
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
    const dispatchQueueUrl = (await this.config.getParameter(StringParameters.Queue.Dispatch.Url)) ?? '';

    const dispatchQueue = iocGetQueueService(dispatchQueueUrl);
    await dispatchQueue.publishMessage('Test message body.');

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter(StringParameters.Queue.Analytics.Url)) ?? '';

    const analyticsQueue = iocGetQueueService(analyticsQueueUrl);
    await analyticsQueue.publishMessage('Test message body.');

    this.logger.trace('Completed request.');
  }
}

export const handler = new Processing(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
