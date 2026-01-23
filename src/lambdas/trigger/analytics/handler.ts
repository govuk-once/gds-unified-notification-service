import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { iocGetConfigurationService, iocGetLogger, iocGetMetrics, iocGetTracer } from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { ConfigurationService } from '@common/services/configurationService';
import { StringParameters } from '@common/utils/parameters';
import { Context } from 'aws-lambda';

export class Analytics extends QueueHandler<unknown, void> {
  public operationId: string = 'analytics';

  constructor(
    protected config: ConfigurationService,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<unknown>, context: Context) {
    this.logger.info('Received request.');

    // (MOCK) Send event to events table
    const eventsTableName = (await this.config.getParameter(StringParameters.Table.Events.Name)) ?? '';
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
