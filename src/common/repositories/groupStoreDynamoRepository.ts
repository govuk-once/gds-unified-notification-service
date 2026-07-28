import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IGroupStoreRecord } from '@common/repositories/interfaces';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
import { IGroups, IModifyGroups } from '@project/lambdas';
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

  public async getUsersGroups(pushID: string): Promise<IGroups[]> {
    const records = await this.getRecordsQuery({ field: 'PushID', value: pushID }, 'PushIDIndex');

    return records
      ? records.map((record) => {
          return {
            GroupID: record.GroupID,
            CompositeID: record.CompositeID,
            Namespace: record.Namespace,
            Group: record.Group,
            Subgroup: record.Subgroup,
          };
        })
      : [];
  }

  public async joinGroups(pushID: string, groupsToJoin: IModifyGroups[]) {
    if (groupsToJoin.length === 0) {
      return;
    }

    const usersGroups = await this.getUsersGroups(pushID);
    const record: IGroupStoreRecord[] = groupsToJoin.flatMap((g) => {
      const compositeID = this.buildCompositeId(g.Namespace, g.Group, g.Subgroup);
      const existingRecord = usersGroups.find((u) => u.CompositeID === compositeID);

      if (existingRecord) {
        this.observability.logger.warn('Request tried to join a group user is already part of', {
          PushID: pushID,
          CompositeID: compositeID,
        });
        return [];
      }

      return {
        GroupID: uuid(),
        PushID: pushID,
        CompositeID: g.Subgroup ? `${g.Namespace}/${g.Group}/${g.Subgroup}` : `${g.Namespace}/${g.Group}`,
        Date: new Date().toISOString(),
        Group: g.Group,
        Namespace: g.Namespace,
        Subgroup: g.Subgroup,
      };
    });

    await this.createRecordBatch(record);
  }

  public async leaveGroups(pushID: string, groupsToLeave: IModifyGroups[]) {
    if (groupsToLeave.length === 0) {
      return;
    }

    const usersGroups = await this.getUsersGroups(pushID);
    const leaveKeys = new Set(groupsToLeave.map((g) => this.buildCompositeId(g.Namespace, g.Group, g.Subgroup)));
    const groupIDsToDelete = usersGroups.filter((u) => leaveKeys.has(u.CompositeID)).map((u) => u.GroupID);

    void Promise.allSettled(
      groupIDsToDelete.map(async (id) => {
        await this.deleteRecord(id);
      })
    );
  }

  private buildCompositeId(namespace: string, group: string, subgroup?: string) {
    return subgroup ? `${namespace}/${group}/${subgroup}` : `${namespace}/${group}`;
  }
}
