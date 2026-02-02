import { ConfigurationService } from '@common/services/configurationService';
import { QueueService } from '@common/services/queueService';
import { Observability } from '@common/utils/observability';
import { StringParameters } from '@common/utils/parameters';

export class AnalyticsQueueService extends QueueService<unknown> {
  protected queueName: string = 'dispatch';
  constructor(
    protected config: ConfigurationService,
    protected observability: Observability
  ) {
    super(observability);
  }

  async initialize() {
    this.sqsQueueUrl = await this.config.getParameter(StringParameters.Queue.Analytics.Url);
    await super.initialize();

    this.observability.logger.info('Analytics Queue Service Initialised.');
    return this;
  }
}
