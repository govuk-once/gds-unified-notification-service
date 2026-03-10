import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

export class InboundDynamoRepository extends DynamodbRepository<IMessageRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.Inbound.KeyAttributes, StringParameters.Table.Inbound.Name);
    return this;
  }

  public async addEvent(event: IAnalytics) {
    return this.appendToList(event.NotificationID, 'Events', [event]);
  }
}
