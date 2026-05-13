import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { ICampaignRecord } from '@project/lambdas/interfaces/ICampaignRecord';

export class CampaignsDynamoRepository extends DynamodbRepository<ICampaignRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.Campaigns.Attributes);
    return this;
  }
}
