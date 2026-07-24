import { Duration, Stack } from 'aws-cdk-lib';
import { AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { CodeSigningConfig, UntrustedArtifactOnDeployment } from 'aws-cdk-lib/aws-lambda';
import { Platform, SigningProfile } from 'aws-cdk-lib/aws-signer';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { UNSDynamoDb } from 'infrastructure/cdk/constructs/bases/UNSDynamoDBConstruct';
import { UNSElasticacheConstruct } from 'infrastructure/cdk/constructs/bases/UNSElasticacheConstruct';
import { UNSKMSConstruct } from 'infrastructure/cdk/constructs/bases/UNSKMSConstruct';
import { UNSQueueConstruct } from 'infrastructure/cdk/constructs/bases/UNSQueueConstruct';
import { UNSSlackAlert } from 'infrastructure/cdk/constructs/bases/UNSSlackIntegration';
import { UNSVpcConstruct } from 'infrastructure/cdk/constructs/bases/UNSVpcConstruct';
import { SSMFromObject } from 'infrastructure/cdk/utils/SSMFromObject';

const interfaceEndpoints = {
  // API
  Apigateway: InterfaceVpcEndpointAwsService.APIGATEWAY,

  // Compute & Params
  Lambda: InterfaceVpcEndpointAwsService.LAMBDA,
  Sqs: InterfaceVpcEndpointAwsService.SQS,
  Kms: InterfaceVpcEndpointAwsService.KMS,
  Ssm: InterfaceVpcEndpointAwsService.SSM,
  SecretsManager: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,

  // Cloudwatch
  CloudwatchApplicationInsights: InterfaceVpcEndpointAwsService.CLOUDWATCH_APPLICATION_INSIGHTS,
  CloudwatchLogs: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
  CloudwatchMonitoring: InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING,
  Xray: InterfaceVpcEndpointAwsService.XRAY,

  // Networking
  NetworkFirewall: InterfaceVpcEndpointAwsService.NETWORK_FIREWALL,
};
const gatewayEndpoints = {
  DynamoDB: GatewayVpcEndpointAwsService.DYNAMODB,
  S3: GatewayVpcEndpointAwsService.S3,
};

export class UNSCommon extends Construct {
  public readonly kms: kms.Key;

  public readonly slackAlert?: UNSSlackAlert;
  public readonly alertTopic: Topic;

  public readonly codeSigning: CodeSigningConfig;
  public readonly codeSigningProfile: SigningProfile;

  public readonly vpc: UNSVpcConstruct<typeof interfaceEndpoints, typeof gatewayEndpoints>;

  public readonly dynamodb: {
    readonly messages: UNSDynamoDb;
    readonly campaigns: UNSDynamoDb;
    readonly groupStore?: UNSDynamoDb;
  };

  public readonly queues: {
    readonly analytics: UNSQueueConstruct;
  };

  public readonly elasticache: UNSElasticacheConstruct;

  constructor(scope: Construct, config: EnvVars) {
    const { constructNamingHelper, namingHelper } = config.utils;
    super(scope, 'common');

    const stack = Stack.of(this);

    //// =====================================================
    //  Shared KMS Key
    //// =====================================================
    this.kms = new UNSKMSConstruct(this, config, {
      name: ['kms', 'main'],
      policies: {
        root: true,
        lambdas: true,
        cloudwatch: true,
      },
    }).key;

    this.kms.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowCloudWatchAlarmsToUseKey',
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal('cloudwatch.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey*'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': [stack.account],
          },
          ArnLike: {
            'aws:SourceArn': [`arn:aws:cloudwatch:eu-west-2:${stack.account}:alarm:*`],
          },
        },
      })
    );

    //// =====================================================
    // Alerts - always create alert topic, conditionally create slack alert linked to the topic if workspace & channel ids are present
    //// =====================================================

    this.alertTopic = new Topic(this, constructNamingHelper('alerts', 'topic'), {
      topicName: namingHelper('sns', 'topic', 'alerts'),
      masterKey: this.kms,
    });

    if (config.ssm.alerts.workspaceId !== null && config.ssm.alerts.channelId !== null) {
      this.slackAlert = new UNSSlackAlert(this, config, {
        workspaceId: config.ssm.alerts.workspaceId,
        channelId: config.ssm.alerts.channelId,
        name: [`alerts`],
        kms: this.kms,
        topics: [this.alertTopic],
      });
    }

    //// =====================================================
    // Code Signing
    //// =====================================================
    this.codeSigningProfile = new SigningProfile(this, constructNamingHelper(`codesigningprofile`), {
      platform: Platform.AWS_LAMBDA_SHA384_ECDSA,
    });

    this.codeSigning = new CodeSigningConfig(this, constructNamingHelper(`codesigning`), {
      signingProfiles: [this.codeSigningProfile],
      untrustedArtifactOnDeployment: UntrustedArtifactOnDeployment.WARN,
    });

    //// =====================================================
    // VPC Configuration & Endpoints
    //// =====================================================
    this.vpc = new UNSVpcConstruct(this, config, {
      name: ['main'],
      cidr: config.vpc.cidr,
      zones: config.vpc.zones,
      interfaceEndpoints: interfaceEndpoints,
      gatewayEndpoints: gatewayEndpoints,
    });

    //// =====================================================
    // DynamoDB Tables
    //// =====================================================
    const messagesTable = new UNSDynamoDb(this, config, {
      name: ['messages'],
      partitionKey: 'NotificationID',
      partitionKeyType: AttributeType.STRING,

      pointInTimeRecovery: true,
      ttlAttribute: 'ExpirationDateTime',
      ttlDurationInSeconds: 60 * 60 * 24 * 30,

      resources: {
        kms: this.kms,
      },
      globalSecondaryIndexes: [
        {
          name: 'DepartmentIDIndex',
          hashKey: 'NotificationID',
          rangeKey: 'DepartmentID',
          projectionType: ProjectionType.KEYS_ONLY,
        },
        {
          name: 'ExternalUserIDIndex',
          hashKey: 'ExternalUserID',
          rangeKey: 'ReceivedDateTime',
          projectionType: ProjectionType.ALL,
        },
      ],
    });

    const campaignsTable = new UNSDynamoDb(this, config, {
      name: ['campaigns'],
      partitionKey: 'CompositeID',
      partitionKeyType: AttributeType.STRING,

      pointInTimeRecovery: true,
      resources: {
        kms: this.kms,
      },
      globalSecondaryIndexes: [],
    });

    const groupStoreTable = config.featureFlag
      ? new UNSDynamoDb(this, config, {
          name: ['groupStore'],
          partitionKey: 'GroupID',
          partitionKeyType: AttributeType.STRING,
          sortKey: 'PushID',
          sortKeyType: AttributeType.STRING,

          pointInTimeRecovery: true,
          resources: {
            kms: this.kms,
          },
          globalSecondaryIndexes: [
            {
              name: 'CompositeIDIndex',
              hashKey: 'PushID',
              rangeKey: 'CompositeID',
              projectionType: ProjectionType.ALL,
            },
          ],
        })
      : undefined;

    this.dynamodb = { messages: messagesTable, campaigns: campaignsTable, groupStore: groupStoreTable };

    //// =====================================================
    // ElastiCache (Valkey Serverless)
    //// =====================================================
    this.elasticache = new UNSElasticacheConstruct(this, config, {
      name: ['cache'],
      vpc: this.vpc,
      kms: this.kms,
    });

    //// =====================================================
    // SQS Queues
    //// =====================================================
    this.queues = {
      analytics: new UNSQueueConstruct(this, config, {
        name: ['analytics'],
        tags: {},
        messageRetentionSeconds: Duration.days(7).toSeconds(),
        resources: {
          kmsKey: this.kms,
        },
        deadLetterQueue: {
          maxRetries: 3,
        },
      }),
    };

    //// =====================================================
    // SSM
    //// =====================================================
    SSMFromObject(this, config, {
      // DynamoDB Tables
      'table/inbound/attributes': this.dynamodb.messages.attributes,
      'table/campaigns/attributes': this.dynamodb.campaigns.attributes,
      'table/groupstore/attributes': this.dynamodb.groupStore?.attributes,

      // Queues
      'queue/analytics/url': this.queues.analytics.queue.queueUrl,

      // Elasticache
      'config/common/cache/name': this.elasticache.cache.serverlessCacheName,
      'config/common/cache/host': this.elasticache.cache.attrEndpointAddress,
      'config/common/cache/user': this.elasticache.user.userName,
    });
  }
}
