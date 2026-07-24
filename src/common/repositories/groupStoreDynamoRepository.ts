import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IGroupStoreRecord } from '@common/repositories/interfaces';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
import { IGroup } from '@project/lambdas';

export class GroupStoreDynamoRepository extends DynamodbRepository<IGroupStoreRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.GroupStore.Attributes);
    return this;
  }

  public async addToGroup(groupID: string, pushID: string, group: IGroup) {
    const record: IGroupStoreRecord = {
      GroupID: groupID,
      PushID: pushID,
      CompositeID: group.subgroup
        ? `${group.namespace}/${group.group}/${group.subgroup}`
        : `${group.namespace}/${group.group}`,
      Group: group.group,
      Namespace: group.namespace,
      Subgroup: group.subgroup,
    };

    await this.createRecord(record);
  }

  public async getUsersGroups(pushID: string): Promise<IGroup[]> {
    const records = await this.getRecords({ field: 'pushID', value: pushID });

    return records
      ? records.map((record) => {
          return {
            namespace: record.Namespace,
            group: record.Group,
            subgroup: record.Subgroup,
          };
        })
      : [];
  }
}
