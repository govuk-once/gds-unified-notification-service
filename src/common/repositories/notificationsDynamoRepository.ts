/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
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
    await super.initialize(StringParameters.Table.Inbound.KeyAttributes);
    // Expiration config
    this.expirationAttribute = JSON.parse(
      await this.config.getParameter(StringParameters.Table.Inbound.KeyAttributes as string)
    ).expirationAttribute;

    this.expirationDurationInSeconds = parseInt(
      JSON.parse(await this.config.getParameter(StringParameters.Table.Inbound.KeyAttributes as string))
        .expirationDurationInSeconds
    );
    return this;
  }

  public async addEvent(event: IAnalytics) {
    return await this.appendToList(event.NotificationID, 'Events', [event]);
  }
}
