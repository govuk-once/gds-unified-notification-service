import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IOrganisationRecord } from '@common/repositories/interfaces/IOrganisationRecord';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IProcessedMessage } from '@project/lambdas';

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
