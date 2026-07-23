import { AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { UNSDynamoDb } from 'infrastructure/cdk/constructs/bases/UNSDynamoDBConstruct';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { SSMFromObject } from 'infrastructure/cdk/utils/SSMFromObject';

export class UNSGroupNotificationsResource extends Construct {
  public readonly groupStoreTable: UNSDynamoDb;

  constructor(scope: Construct, config: EnvVars, common: UNSCommon) {
    super(scope, 'groupNotifications');

    //// =====================================================
    // DynamoDB Tables
    //// =====================================================
    this.groupStoreTable = new UNSDynamoDb(this, config, {
      name: ['groupStore'],
      partitionKey: 'GroupID',
      partitionKeyType: AttributeType.STRING,
      sortKey: 'PushID',
      sortKeyType: AttributeType.STRING,

      pointInTimeRecovery: true,
      resources: {
        kms: common.kms,
      },
      globalSecondaryIndexes: [
        {
          name: 'CompositeIDIndex',
          hashKey: 'PushID',
          rangeKey: 'CompositeID',
          projectionType: ProjectionType.ALL,
        },
      ],
    });

    //// =====================================================
    // SSM
    //// =====================================================
    SSMFromObject(this, config, {
      // DynamoDB Tables
      'table/groupstore/attributes': this.groupStoreTable.attributes,
    });
  }
}
