import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
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

  public static buildCompositeID(organisationID?: string, departmentID?: string, campaignID?: string): string {
    return [organisationID, departmentID, campaignID].filter(Boolean).join('/');
  }

  public async incrementCampaigns(
    campaignID: string,
    organisationID: string | undefined,
    departmentID: string | undefined,
    event: NotificationStateEnum
  ) {
    const record: ICampaignRecord = {
      CompositeID: CampaignsDynamoRepository.buildCompositeID(organisationID, departmentID, campaignID),
    };
    return await this.incrementRecord(record, event);
  }
}
