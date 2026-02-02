import { ConfigurationService } from '@common/services/configurationService';
import { ObservabilityService } from '@common/services/observabilityService';
import { QueueService } from '@common/services/queueService';
import { StringParameters } from '@common/utils/parameters';

export class AnalyticsQueueService extends QueueService<unknown> {
  protected queueName: string = 'dispatch';
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
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
