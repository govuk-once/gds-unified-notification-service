import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { MetricsLabels, ObservabilityService } from '@common/services/observabilityService';
import { QueueService } from '@common/services/queueService';
import { StringParameters } from '@common/utils/parameters';

export class AnalyticsQueueService extends QueueService<unknown> {
  protected queueName: string = 'analytics';
  constructor(
    protected config: ConfigurationService,
    client: SQSClient,
    protected observability: ObservabilityService
  ) {
    super(client, observability);
  }

  async initialize() {
    this.sqsQueueUrl = await this.config.getParameter(StringParameters.Queue.Analytics.Url);
    await super.initialize();

    this.observability.logger.info('Analytics Queue Service Initialised.');
    return this;
  }

  public addPublishingSuccessMetric(count: number) {
    this.observability.metrics.addMetric(MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_SUCCESSFULLY, MetricUnit.Count, count);
  }

  public addPublishingFailedMetric(count: number): void {
    this.observability.metrics.addMetric(MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_FAILED, MetricUnit.Count, count);
  }
}
