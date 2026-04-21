import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IDynamoAttributesSchema } from '@common/repositories/interfaces/IDynamoKeys';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

export class NotificationsDynamoRepository extends DynamodbRepository<IMessageRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.Inbound.Attributes);
    // Expiration config

    this.expirationAttribute = (
      await this.config.getParameterAsType(StringParameters.Table.Inbound.Attributes, IDynamoAttributesSchema)
    ).expirationAttribute;
    this.expirationDurationInSeconds = (
      await this.config.getParameterAsType(StringParameters.Table.Inbound.Attributes, IDynamoAttributesSchema)
    ).expirationDurationInSeconds;
    return this;
  }

  public async addEvent(event: IAnalytics) {
    return await this.appendToList(event.NotificationID, 'Events', [event]);
  }
}
