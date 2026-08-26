import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { NotificationStateEnum } from '@common/models';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ICampaignRecord, ICampaignRecordSchema } from '@common/repositories/interfaces';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';

export class CampaignsDynamoRepository extends DynamodbRepository<typeof ICampaignRecordSchema> {
  protected recordSchema = ICampaignRecordSchema;

  constructor(
    protected config: ConfigurationService,
    client: DynamoDB,
    protected observability: ObservabilityService
  ) {
    super(config, client, observability);
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
