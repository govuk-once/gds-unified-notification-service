import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { MetricsLabels, ObservabilityService } from '@common/services/observabilityService';
import { QueueService } from '@common/services/queueService';
import { IProcessedMessage } from '@project/lambdas';
import SSMParameters from '@shared/ssmParameter';

export class DispatchQueueService extends QueueService<IProcessedMessage> {
  protected queueName: string = 'dispatch';

  constructor(
    protected observability: ObservabilityService,
    protected client: SQSClient,
    protected sqsQueueUrl: string
  ) {
    super(observability, client, sqsQueueUrl);
  }

  public static async create(config: ConfigurationService, observability: ObservabilityService, client: SQSClient) {
    return new DispatchQueueService(
      observability,
      client,
      await config.getParameter(SSMParameters.Queue.Dispatch.Url)
    );
  }

  public addPublishingSuccessMetric(count: number) {
    this.observability.metrics.addMetric(MetricsLabels.QUEUE_DISPATCH_PUBLISHED_SUCCESSFULLY, MetricUnit.Count, count);
  }

  public addPublishingFailedMetric(count: number) {
    this.observability.metrics.addMetric(MetricsLabels.QUEUE_DISPATCH_PUBLISHED_FAILED, MetricUnit.Count, count);
  }
}
