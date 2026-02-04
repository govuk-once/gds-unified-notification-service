import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

export class EventsDynamoRepository extends DynamodbRepository<IMessageRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(observability);
  }

  async initialize() {
    this.tableName = await this.config.getParameter(StringParameters.Table.Events.Name);
    this.tableKey = await this.config.getParameter(StringParameters.Table.Events.Key);
    await super.initialize();
    return this;
  }
}
