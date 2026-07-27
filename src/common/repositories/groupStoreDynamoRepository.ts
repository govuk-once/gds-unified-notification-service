import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IGroupStoreRecord } from '@common/repositories/interfaces';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
import { IGroup, IModifyGroups } from '@project/lambdas';
import { v4 as uuid } from 'uuid';

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

  public async joinGroups(pushID: string, groups: IModifyGroups) {
    const record: IGroupStoreRecord[] = groups.map((g) => {
      return {
        GroupID: uuid(),
        PushID: pushID,
        CompositeID: g.Subgroup ? `${g.Namespace}/${g.Group}/${g.Subgroup}` : `${g.Namespace}/${g.Group}`,
        Group: g.Group,
        Namespace: g.Namespace,
        Subgroup: g.Subgroup,
      };
    });

    await this.createRecordBatch(record);
  }

  public async getUsersGroups(pushID: string): Promise<IGroup[]> {
    const records = await this.getRecords({ field: 'pushID', value: pushID });

    return records
      ? records.map((record) => {
          return {
            groupID: record.GroupID,
            namespace: record.Namespace,
            group: record.Group,
            subgroup: record.Subgroup,
          };
        })
      : [];
  }

  public async leaveGroups(pushID: string, groupsToLeave: IModifyGroups) {
    const usersGroups = await this.getUsersGroups(pushID);

    const leaveKeys = new Set(groupsToLeave.map((g) => `${g.Namespace}/${g.Group}`));
    const groupIdsToDelete = usersGroups.filter((u) => leaveKeys.has(`${u.namespace}/${u.group}`)).map((u) => u.group);

    void Promise.allSettled(
      groupIdsToDelete.map(async (id) => {
        try {
          await this.deleteRecord(id);
        } catch (error) {
          if (error instanceof Error && error.message === 'ResourceNotFoundException') {
            return;
          }
          throw error;
        }
      })
    );
  }
}
