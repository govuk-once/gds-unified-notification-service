import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { MetricsLabels, ObservabilityService } from '@common/services/observabilityService';
import { QueueService } from '@common/services/queueService';
import { StringParameters } from '@common/utils';
import { IMessage } from '@project/lambdas';

export class ProcessingQueueService extends QueueService<IMessage> {
  protected queueName: string = 'processing';

  constructor(
    protected observability: ObservabilityService,
    protected client: SQSClient,
    protected sqsQueueUrl: string
  ) {
    super(observability, client, sqsQueueUrl);
  }

  public static async create(config: ConfigurationService, observability: ObservabilityService, client: SQSClient) {
    return new ProcessingQueueService(
      observability,
      client,
      await config.getParameter(StringParameters.Queue.Processing.Url)
    );
  }

  public addPublishingSuccessMetric(count: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY,
      MetricUnit.Count,
      count
    );
  }

  public addPublishingFailedMetric(count: number): void {
    this.observability.metrics.addMetric(MetricsLabels.QUEUE_PROCESSING_PUBLISHED_FAILED, MetricUnit.Count, count);
  }
}
