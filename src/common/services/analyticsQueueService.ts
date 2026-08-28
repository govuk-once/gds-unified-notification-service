import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { MetricsLabels, ObservabilityService } from '@common/services/observabilityService';
import { QueueService } from '@common/services/queueService';
import { StringParameters } from '@common/utils';

export class AnalyticsQueueService extends QueueService<unknown> {
  protected queueName: string = 'analytics';

  constructor(
    protected readonly observability: ObservabilityService,
    protected readonly client: SQSClient,
    protected readonly queueUrl: string
  ) {
    super(observability, client, queueUrl);
  }

  public static async create(config: ConfigurationService, observability: ObservabilityService, client: SQSClient) {
    return new AnalyticsQueueService(
      observability,
      client,
      await config.getParameter(StringParameters.Queue.Analytics.Url)
    );
  }

  public addPublishingSuccessMetric(count: number) {
    this.observability.metrics.addMetric(MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_SUCCESSFULLY, MetricUnit.Count, count);
  }

  public addPublishingFailedMetric(count: number): void {
    this.observability.metrics.addMetric(MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_FAILED, MetricUnit.Count, count);
  }
}
