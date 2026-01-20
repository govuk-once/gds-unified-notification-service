import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetConfigurationService, iocGetLogger, iocGetMetrics, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { StringParameters } from '@common/utils/parameters';
import { Context } from 'aws-lambda';

export class Analytics extends QueueHandler<unknown, void> {
  public operationId: string = 'analytics';

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

    // (MOCK) Send event to events table
    const eventsTableName = (await this.config.getParameter(StringParameters.Table.Events.Name)) ?? '';
    this.logger.info(`Received Record from ${event.Records[0].messageAttributes['Title'].stringValue}.`);

    this.logger.info('Sent Record.');
    this.logger.info('Completed request.');
  }
}

export const handler = new Analytics(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
