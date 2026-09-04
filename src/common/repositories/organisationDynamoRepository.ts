import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IDynamoAttributes, IDynamoAttributesSchema } from '@common/repositories/interfaces';
import { IOrganisationRecord, IOrganisationRecordSchema } from '@common/repositories/interfaces/IOrganisationRecord';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
import { IProcessedMessage } from '@project/lambdas';

export class OrganisationsDynamoRepository extends DynamodbRepository<typeof IOrganisationRecordSchema> {
  protected recordSchema = IOrganisationRecordSchema;

  constructor(
    protected readonly config: ConfigurationService,
    protected readonly observability: ObservabilityService,
    protected readonly client: DynamoDB,
    protected readonly tableAttributes: IDynamoAttributes
  ) {
    super(config, observability, client, tableAttributes);
  }

  static async create(config: ConfigurationService, observability: ObservabilityService, client: DynamoDB) {
    return new OrganisationsDynamoRepository(
      config,
      observability,
      client,
      await config.getParameterAsType(StringParameters.Table.Organisations.Attributes, IDynamoAttributesSchema)
    );
  }

  public async getOrganisations(notifications: IProcessedMessage[]): Promise<IOrganisationRecord[]> {
    const uniqueOrganisationsIDs = Array.from(new Set(notifications.map((x) => x.OrganisationID)));
    const promises = uniqueOrganisationsIDs.map(async (organisationID) => {
      const organisationRecord = await this.getRecord(organisationID);
      return organisationRecord;
    });

    const results = await Promise.allSettled(promises);
    const records = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((record) => record !== null);

    return records;
  }
}
