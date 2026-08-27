import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { MetricsLabels, ObservabilityService } from '@common/services/observabilityService';
import { QueueService } from '@common/services/queueService';
import { StringParameters } from '@common/utils/parameters';
import { IGroupMessageMetadata } from '@project/lambdas';

export class GroupProcessingQueueService extends QueueService<IGroupMessageMetadata> {
  protected queueName: string = 'groupprocessing';

  constructor(
    protected observability: ObservabilityService,
    protected client: SQSClient,
    protected sqsQueueUrl: string
  ) {
    super(observability, client, sqsQueueUrl);
  }

  public static async create(config: ConfigurationService, observability: ObservabilityService) {
    return new GroupProcessingQueueService(
      observability,
      new SQSClient({ region: 'eu-west-2' }),
      await config.getParameter(StringParameters.Queue.GroupProcessing.Url)
    );
  }

  public addPublishingSuccessMetric(count: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_SUCCESSFULLY,
      MetricUnit.Count,
      count
    );
  }

  public addPublishingFailedMetric(count: number): void {
    this.observability.metrics.addMetric(
      MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_FAILED,
      MetricUnit.Count,
      count
    );
  }
}
