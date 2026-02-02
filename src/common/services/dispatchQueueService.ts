import { ConfigurationService } from '@common/services/configurationService';
import { QueueService } from '@common/services/queueService';
import { Observability } from '@common/utils/observability';
import { StringParameters } from '@common/utils/parameters';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';

export class DispatchQueueService extends QueueService<IProcessedMessage> {
  protected queueName: string = 'dispatch';
  constructor(
    protected config: ConfigurationService,
    protected observability: Observability
  ) {
    super(observability);
  }

  async initialize() {
    this.sqsQueueUrl = await this.config.getParameter(StringParameters.Queue.Dispatch.Url);
    await super.initialize();

    this.observability.logger.info('Dispatch Queue Service Initialised.');
    return this;
  }
}
