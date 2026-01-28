import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ConfigurationService } from '@common/services/configurationService';
import { QueueService } from '@common/services/queueService';
import { StringParameters } from '@common/utils/parameters';
import { IMessage } from '@project/lambdas/interfaces/IMessage';

export class ProcessingQueueService extends QueueService<IMessage> {
  constructor(
    protected config: ConfigurationService,
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  async initialize() {
    const queueUrl = await this.config.getParameter(StringParameters.Queue.Processing.Url);
    if (queueUrl == undefined) {
      throw new Error('Failed to fetch queueUrl');
    }
    this.sqsQueueUrl = queueUrl;
    await super.initialize();

    this.logger.info('Processing Queue Service Initialised.');
    return this;
  }
}
