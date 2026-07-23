import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IGroupStoreRecord } from '@common/repositories/interfaces';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
import { ISubscriptionGroup } from '@project/lambdas';

export class GroupStoreDynamoRepository extends DynamodbRepository<IGroupStoreRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.Subscriptions.Attributes);
    return this;
  }

  public async addSubscription(subscriptionID: string, pushID: string, subscriptionGroup: ISubscriptionGroup) {
    const record: IGroupStoreRecord = {
      SubscriptionID: subscriptionID,
      PushID: pushID,
      CompositeID: subscriptionGroup.subgroup
        ? `${subscriptionGroup.namespace}/${subscriptionGroup.subscription}/${subscriptionGroup.subgroup}`
        : `${subscriptionGroup.namespace}/${subscriptionGroup.subscription}`,
      Subscription: subscriptionGroup.subscription,
      Namespace: subscriptionGroup.namespace,
      Subgroup: subscriptionGroup.subgroup,
    };

    await this.createRecord(record);
  }

  public async getSubscriptions(pushID: string): Promise<ISubscriptionGroup[]> {
    const records = await this.getRecords({ field: 'pushID', value: pushID });

    return records
      ? records.map((record) => {
          return {
            namespace: record.Namespace,
            subscription: record.Subscription,
            subgroup: record.Subgroup,
          };
        })
      : [];
  }
}
