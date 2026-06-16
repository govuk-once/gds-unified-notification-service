import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export interface UNSDynamoDbProps {
  readonly name: string[];
  readonly partitionKey: string;
  readonly partitionKeyType?: AttributeType;
  readonly sortKey?: string;
  readonly sortKeyType?: AttributeType;
  readonly pointInTimeRecovery?: boolean;
  readonly ttlAttribute?: string;
  readonly ttlDurationInSeconds?: number;
  readonly resources: {
    readonly kms: kms.Key;
  };
  readonly globalSecondaryIndexes?: {
    readonly name: string;
    readonly hashKey: string;
    readonly projectionType: ProjectionType;
    readonly rangeKey?: string;
    readonly readCapacity?: number;
    readonly writeCapacity?: number;
    readonly nonKeyAttributes?: string[];
  }[];
}

interface TablePermission {
  readonly arn: string;
  readonly read: boolean;
  readonly write: boolean;
  readonly scan: boolean;
}

export class UNSDynamoDb extends Construct {
  public readonly table: Table;

  public readonly attributes: {
    readonly name: string;
    readonly hashKey: string;
    readonly rangeKey: string | null;
    readonly attributes: string[];
    readonly expirationAttribute?: string;
    readonly expirationDurationInSeconds?: number;
  };

  public readonly permissions: {
    readonly readOnlyById: TablePermission;
    readonly readOnly: TablePermission;
    readonly readAndWrite: TablePermission;
  };

  constructor(scope: Construct, config: EnvVars, props: UNSDynamoDbProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(`dynamodb`, ...props.name));

    // Create DynamoDB Table
    this.table = new Table(this, namingHelper(...props.name), {
      // Definitions
      tableName: namingHelper(...props.name),
      partitionKey: { name: props.partitionKey, type: props.partitionKeyType ?? AttributeType.STRING },
      ...(props.sortKey ? { sortKey: { name: props.sortKey, type: props.sortKeyType ?? AttributeType.STRING } } : {}),

      // Billing
      billingMode: BillingMode.PAY_PER_REQUEST,

      // Encryption at rest
      encryptionKey: props.resources.kms,

      // Backups & Data retention
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.pointInTimeRecovery ?? true,
        recoveryPeriodInDays: 30,
      },
      deletionProtection: config.isMainEnv,
      removalPolicy: config.removalPolicy,

      // Expiration
      ...(props.ttlAttribute ? { timeToLiveAttribute: props.ttlAttribute } : {}),
    });

    // Add Global Secondary Indexes (GSIs)
    for (const gsi of props.globalSecondaryIndexes ?? []) {
      this.table.addGlobalSecondaryIndex({
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

    // Populate  attributes
    this.attributes = {
      name: namingHelper(...props.name),
      hashKey: props.partitionKey,
      rangeKey: props.sortKey ?? null,
      attributes: [],
      expirationAttribute: props.ttlAttribute,
      expirationDurationInSeconds: props.ttlDurationInSeconds,
    };

    // Helper closure to assemble permission objects
    const createPermissionMapping = (read: boolean, scan: boolean, write: boolean): TablePermission => ({
      arn: this.table.tableArn,
      read,
      write,
      scan,
    });

    // Populate exposed IAM helper shapes
    this.permissions = {
      readOnlyById: createPermissionMapping(true, false, false),
      readOnly: createPermissionMapping(true, true, false),
      readAndWrite: createPermissionMapping(true, true, true),
    };
  }
}
