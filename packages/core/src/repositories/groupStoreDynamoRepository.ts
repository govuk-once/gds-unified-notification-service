import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { IGroups, IModifyGroups } from '@common/models/interfaces';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import {
  IDynamoAttributes,
  IDynamoAttributesSchema,
  IGroupStoreRecord,
  IGroupStoreRecordSchema,
} from '@common/repositories/interfaces';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { partition } from '@common/utils/array';
import SSMParameters from '@shared/ssmParameter';
import { v4 as uuid } from 'uuid';

export class GroupStoreDynamoRepository extends DynamodbRepository<typeof IGroupStoreRecordSchema> {
  protected recordSchema = IGroupStoreRecordSchema;

  constructor(
    protected readonly config: ConfigurationService,
    protected readonly observability: ObservabilityService,
    protected readonly client: DynamoDB,
    protected readonly tableAttributes: IDynamoAttributes
  ) {
    super(config, observability, client, tableAttributes);
  }

  static async create(config: ConfigurationService, observability: ObservabilityService, client: DynamoDB) {
    return new GroupStoreDynamoRepository(
      config,
      observability,
      client,
      await config.getParameter(SSMParameters.Table.GroupStore.Attributes, IDynamoAttributesSchema)
    );
  }

  public async getUsersGroups(pushID: string): Promise<IGroups[]> {
    const records = await this.getRecordsQuery({ field: 'PushID', value: pushID }, 'PushIDIndex');

    return records
      ? records.map((record) => ({
          GroupID: record.GroupID,
          CompositeID: record.CompositeID,
          Namespace: record.Namespace,
          Group: record.Group,
          Subgroup: record.Subgroup,
        }))
      : [];
  }

  public async getUsersInGroup(namespace: string, group: string, subgroup?: string): Promise<string[]> {
    const compositeID = this.buildCompositeId(namespace, group, subgroup);
    const records = await this.getRecordsQuery({ field: 'CompositeID', value: compositeID }, 'CompositeIDIndex');

    return records ? records.map((record) => record.PushID) : [];
  }

  public async joinGroups(
    pushID: string,
    groupsToJoin: IModifyGroups[],
    usersGroups: IGroups[] = []
  ): Promise<IGroups[]> {
    if (groupsToJoin.length === 0) {
      this.observability.logger.debug('No groups to join provided - returning usersGroups', {
        pushID,
      });
      return usersGroups;
    }
    const knownKeys = new Set(usersGroups.map((u) => u.CompositeID));
    const recordsToCreate: IGroupStoreRecord[] = [];

    for (const g of groupsToJoin) {
      const compositeID = this.buildCompositeId(g.Namespace, g.Group, g.Subgroup);

      if (knownKeys.has(compositeID)) {
        this.observability.logger.warn('Request tried to join a group user is already part of', {
          PushID: pushID,
          CompositeID: compositeID,
        });
        continue;
      }

      // Adding the key here also drops duplicates within the request itself
      knownKeys.add(compositeID);
      recordsToCreate.push({
        GroupID: uuid(),
        PushID: pushID,
        CompositeID: compositeID,
        Date: new Date().toISOString(),
        Group: g.Group,
        Namespace: g.Namespace,
        Subgroup: g.Subgroup,
      });
    }

    if (recordsToCreate.length === 0) {
      return usersGroups;
    }

    await this.createRecordBatch(recordsToCreate);
    this.observability.logger.info('Joining groups', {
      pushID,
      groupsToJoin: recordsToCreate.map((r) => ({
        GroupID: r.GroupID,
        CompositeID: r.CompositeID,
        Namespace: r.Namespace,
        Group: r.Group,
        Subgroup: r.Subgroup,
      })),
    });

    return [
      ...usersGroups,
      ...recordsToCreate.map((r) => ({
        GroupID: r.GroupID,
        CompositeID: r.CompositeID,
        Namespace: r.Namespace,
        Group: r.Group,
        Subgroup: r.Subgroup,
      })),
    ];
  }

  public async leaveGroups(
    pushID: string,
    groupsToLeave: IModifyGroups[],
    usersGroups: IGroups[] = []
  ): Promise<IGroups[]> {
    if (usersGroups.length === 0) {
      this.observability.logger.debug('No user groups found for pushID - returning empty array', {
        pushID,
      });
      return [];
    }
    if (groupsToLeave.length === 0) {
      this.observability.logger.debug('No groups to leave provided - returning usersGroups', {
        pushID,
      });
      return usersGroups;
    }

    const leaveKeys = new Set(groupsToLeave.map((g) => this.buildCompositeId(g.Namespace, g.Group, g.Subgroup)));
    const [leaving, remaining] = partition(usersGroups, (u) => leaveKeys.has(u.CompositeID));

    this.observability.logger.info('Leaving groups', { pushID, groupsToLeave: leaving });
    await Promise.allSettled(leaving.map((u) => this.deleteRecord(u.GroupID, pushID)));

    return remaining;
  }

  private buildCompositeId(namespace: string, group: string, subgroup?: string) {
    return subgroup ? `${namespace}/${group}/${subgroup}` : `${namespace}/${group}`;
  }
}
