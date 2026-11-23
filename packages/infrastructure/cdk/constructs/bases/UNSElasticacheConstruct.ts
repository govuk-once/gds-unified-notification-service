import { EnvVars } from '@infra/cdk/config';
import { UNSVpcConstruct } from '@infra/cdk/constructs/bases/UNSVpcConstruct';
import { CfnServerlessCache, CfnUser, CfnUserGroup } from 'aws-cdk-lib/aws-elasticache';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface UNSElasticacheConstructProps {
  readonly name: string[];
  readonly vpc: UNSVpcConstruct;
  readonly kms: Key;
}

export class UNSElasticacheConstruct extends Construct {
  readonly cache: CfnServerlessCache;
  readonly group: CfnUserGroup;
  readonly user: CfnUser;
  readonly arns: string[];

  constructor(scope: Construct, config: EnvVars, props: UNSElasticacheConstructProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(`elca`, ...props.name));

    // Valkey IAM User
    this.user = new CfnUser(this, `elcauser`, {
      engine: 'valkey',
      userId: namingHelper(`elcauser`),
      userName: namingHelper(`elcauser`),
      authenticationMode: {
        Type: 'iam',
      },
      accessString: 'on ~* +@all',
    });
    this.user.cfnOptions.deletionPolicy = config.deletionPolicy;

    // Valkey User Group assignment
    this.group = new CfnUserGroup(this, `group`, {
      engine: 'valkey',
      userGroupId: namingHelper(`elca`, `group`).replaceAll(`-`, ``),
      userIds: [this.user.userId],
    });
    this.group.addResourceDependency(this.user);
    this.group.cfnOptions.deletionPolicy = config.deletionPolicy;

    // Valkey Serverless Cluster setup
    this.cache = new CfnServerlessCache(this, `cache`, {
      engine: 'valkey',
      serverlessCacheName: namingHelper(`elca`, `main`),
      subnetIds: props.vpc.vpc.privateSubnets.map((s) => s.subnetId),
      securityGroupIds: [props.vpc.securityGroups.privateEgress.securityGroupId],
      majorEngineVersion: '8',
      userGroupId: this.group.userGroupId,
      // Ephemeral stacks use AWS-managed encryption: a fresh CMK requires the ElastiCache service to
      // create a grant via kms:CreateGrant, which can fail silently and leave the cache in creating
      // indefinitely. No production data lives in ephemeral, so AWS-managed encryption is acceptable.
      kmsKeyId: config.isEphemeral ? undefined : props.kms.keyId,
      dailySnapshotTime: '04:00',
      snapshotRetentionLimit: 1,
      cacheUsageLimits: {
        dataStorage: {
          maximum: 10,
          unit: 'GB',
        },
        ecpuPerSecond: {
          maximum: 5000,
        },
      },
    });
    this.cache.addResourceDependency(this.group);
    this.cache.cfnOptions.deletionPolicy = config.deletionPolicy;

    this.arns = [this.cache.attrArn, this.user.attrArn, this.cache.attrArn];
  }
}
