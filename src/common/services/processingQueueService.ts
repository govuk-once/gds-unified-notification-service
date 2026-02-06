import { ConfigurationService } from '@common/services/configurationService';
import { ObservabilityService } from '@common/services/observabilityService';
import { QueueService } from '@common/services/queueService';
import { StringParameters } from '@common/utils/parameters';
import { IMessage } from '@project/lambdas/interfaces/IMessage';

export class ProcessingQueueService extends QueueService<IMessage> {
  protected queueName: string = 'processing';
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(observability);
  }

  async initialize() {
    this.sqsQueueUrl = await this.config.getParameter(StringParameters.Queue.Processing.Url);
    this.observability.logger.error(this.sqsQueueUrl);

    await super.initialize();

    this.observability.logger.info('Processing Queue Service Initialised.');
    return this;
  }
}
