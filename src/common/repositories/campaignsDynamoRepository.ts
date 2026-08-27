import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IDynamoAttributes, IDynamoAttributesSchema } from '@common/repositories/interfaces';
import { ICampaignRecord, ICampaignRecordSchema } from '@common/repositories/interfaces/ICampaignRecord';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';

export class CampaignsDynamoRepository extends DynamodbRepository<typeof ICampaignRecordSchema> {
  protected recordSchema = ICampaignRecordSchema;

  constructor(
    protected readonly config: ConfigurationService,
    protected readonly observability: ObservabilityService,
    protected readonly client: DynamoDB,
    protected readonly tableAttributes: IDynamoAttributes
  ) {
    super(config, observability, client, tableAttributes);
  }

  static async create(config: ConfigurationService, observability: ObservabilityService) {
    return new CampaignsDynamoRepository(
      config,
      observability,
      new DynamoDB({
        region: 'eu-west-2',
      }),
      await config.getParameterAsType(StringParameters.Table.Campaigns.Attributes, IDynamoAttributesSchema)
    );
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
