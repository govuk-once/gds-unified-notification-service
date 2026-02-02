import { ConfigurationService } from '@common/services/configurationService';
import { QueueService } from '@common/services/queueService';
import { Observability } from '@common/utils/observability';
import { StringParameters } from '@common/utils/parameters';
import { IMessage } from '@project/lambdas/interfaces/IMessage';

export class ProcessingQueueService extends QueueService<IMessage> {
  protected queueName: string = 'processing';
  constructor(
    protected config: ConfigurationService,
    protected observability: Observability
  ) {
    super(observability);
  }

  async initialize() {
    this.sqsQueueUrl = await this.config.getParameter(StringParameters.Queue.Processing.Url);
    await super.initialize();

    this.observability.logger.info('Processing Queue Service Initialised.');
    return this;
  }
}
