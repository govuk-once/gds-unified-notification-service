import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

export class EventsDynamoRepository extends DynamodbRepository<IMessageRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.Events.KeyAttributes, StringParameters.Table.Events.Name);
    return this;
  }
}
