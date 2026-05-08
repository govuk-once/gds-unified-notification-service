import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cdk from 'aws-cdk-lib/core';
import { Stack } from 'aws-cdk-lib/core';
import { EnvVars } from 'infrastructure/cdk/config';

export const dynamodbFactory = (
  stack: Stack,
  config: EnvVars,
  props: {
    name: string[];
    partitionKey: string;
    partitionKeyType?: AttributeType;
    sortKey?: string;
    sortKeyType?: AttributeType;
    pointInTimeRecovery?: boolean;
    ttlAttribute?: string;
    resources: {
      kms: kms.Key;
    };
    globalSecondaryIndexes?: {
      name: string;
      hashKey: string;
      projectionType: ProjectionType;
      rangeKey?: string;
      readCapacity?: number;
      writeCapacity?: number;
      nonKeyAttributes?: string[];
    }[];
  }
) => {
  const table = new Table(stack, config.utils.namingHelper(...props.name), {
    // Table definitions
    tableName: config.utils.namingHelper(...props.name),
    partitionKey: { name: props.partitionKey, type: props.partitionKeyType ?? AttributeType.STRING },
    ...(props.sortKey ? { sortKey: { name: props.sortKey, type: props.sortKeyType ?? AttributeType.STRING } } : {}),

    billingMode: BillingMode.PAY_PER_REQUEST,

    // Encryption at rest
    encryptionKey: props.resources.kms,

    // Point in time recovery
    pointInTimeRecoverySpecification: {
      pointInTimeRecoveryEnabled: props.pointInTimeRecovery ?? true,
      recoveryPeriodInDays: 30,
    },

    // Deletion protection
    deletionProtection: config.isMainEnv(),
    removalPolicy: cdk.RemovalPolicy.RETAIN,

    // Conditionally define TTL Attribute if required
    ...(props.ttlAttribute ? { timeToLiveAttribute: props.ttlAttribute } : {}),
  });

  config.utils.tagsHelper(table);

  // Global indexes
  for (const gsi of props.globalSecondaryIndexes ?? []) {
    table.addGlobalSecondaryIndex({
      indexName: gsi.name,
      partitionKey: {
        name: gsi.hashKey,
        type: AttributeType.STRING,
      },
      ...(gsi.rangeKey && {
        sortKey: {
          name: gsi.rangeKey,
          type: AttributeType.STRING,
        },
      }),
      ...(gsi.nonKeyAttributes && {
        nonKeyAttributes: gsi.nonKeyAttributes,
      }),
      projectionType: gsi.projectionType ?? ProjectionType.ALL,
    });
  }

  return table;
};
