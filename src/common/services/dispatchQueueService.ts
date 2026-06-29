import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ConfigurationService } from '@common/services/configurationService';
import { MetricsLabels, ObservabilityService } from '@common/services/observabilityService';
import { QueueService } from '@common/services/queueService';
import { StringParameters } from '@common/utils/parameters';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';

export class DispatchQueueService extends QueueService<IProcessedMessage> {
  protected queueName: string = 'dispatch';
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(observability);
  }

  async initialize() {
    this.sqsQueueUrl = await this.config.getParameter(StringParameters.Queue.Dispatch.Url);
    await super.initialize();

    this.observability.logger.info('Dispatch Queue Service Initialised.');
    return this;
  }

  public addPublishingSuccessMetric(count: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.QUEUE_DISPATCH_PUBLISHED_SUCCESSFULLY,
      MetricUnit.Count,
      count
    );
  }

  public addPublishingFailedMetric(count: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.QUEUE_DISPATCH_PUBLISHED_FAILED,
      MetricUnit.Count,
      count
    );
  }
}
