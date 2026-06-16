import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { IOrganisationRecord } from '@project/lambdas/interfaces/IOrganisationRecord';

export class OrganisationsDynamoRepository extends DynamodbRepository<IOrganisationRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.Organisations.Attributes);
    return this;
  }

  public async getOrganisations(notifications: IMessageRecord[]): Promise<IOrganisationRecord[]> {
    const uniqueOrganisationsIDs = Array.from(new Set(notifications.map((x) => x.OrganisationID)));
    const promises = uniqueOrganisationsIDs.map(async (organisationID) => {
      const organisationRecord = await this.getRecord(organisationID);
      return organisationRecord;
    });

    const results = await Promise.all(promises);
    return results.filter((record) => record !== null);
  }
}
