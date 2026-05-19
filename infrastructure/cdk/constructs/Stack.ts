import { IdentitySource, RequestAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { CodeSigningConfig, HttpMethod, UntrustedArtifactOnDeployment } from 'aws-cdk-lib/aws-lambda';
import { Platform, SigningProfile } from 'aws-cdk-lib/aws-signer';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Duration, Stack, StackProps } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { apiGatewayFactory } from 'infrastructure/cdk/factories/apiGatewayFactory';
import { dynamodbFactory } from 'infrastructure/cdk/factories/dynamoDBFactory';
import { kmsKeyFactory } from 'infrastructure/cdk/factories/kmsKeyFactory';
import { lambdaFactory } from 'infrastructure/cdk/factories/lambdaFactory';
import { queueFactory } from 'infrastructure/cdk/factories/sqsFactory';
import { vpcFactory } from 'infrastructure/cdk/factories/vpcFactory';
/**
 * Note on convention:
 * UNS Stack offloads generation of resource sets (whether by resource type or group) into protected functions
 * Constructor method of this class then ties all of the relevant resources together and passes references alongside - this makes it easy to see which resource sets are dependent on which
 *
 * Ideally all of the resource sets should be relying on simplified factory methods
 */
export class UNS extends Stack {
  protected kms() {
    // KMS
    return kmsKeyFactory(this, this.config, {
      name: ['kms', 'main'],
      policies: {
        root: true,
        lambdas: true,
        cloudwatch: true,
      },
    });
  }

  protected vpc() {
    return vpcFactory(this, this.config, {
      name: 'main',
      cidr: this.config.vpc.cidr,
      zones: this.config.vpc.zones,
      interfaceEndpoints: {
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

        // TODO - Via terraform we were utiliting route53 - InterfaceVpcEndpointAwsService does not include that service, confirm whether it's necessary post migration
      },
      gatewayEndpoints: {
        DynamoDB: GatewayVpcEndpointAwsService.DYNAMODB,
        S3: GatewayVpcEndpointAwsService.S3,
      },
    });
  }

  protected queues(refs: { kms: ReturnType<UNS['kms']> }) {
    // SQS Queues
    const incoming = queueFactory(this, this.config, {
      name: ['incoming'],
      tags: {},
      messageRetentionSeconds: Duration.days(7).toSeconds(),
      resources: {
        kmsKey: refs.kms,
      },
      deadLetterQueue: {
        maxRetries: 3,
      },
    });
    const processing = queueFactory(this, this.config, {
      name: ['processing'],
      tags: {},
      messageRetentionSeconds: Duration.days(7).toSeconds(),
      resources: {
        kmsKey: refs.kms,
      },
      deadLetterQueue: {
        maxRetries: 3,
      },
    });
    const dispatch = queueFactory(this, this.config, {
      name: ['dispatch'],
      tags: {},
      messageRetentionSeconds: Duration.days(7).toSeconds(),
      resources: {
        kmsKey: refs.kms,
      },
      deadLetterQueue: {
        maxRetries: 3,
      },
    });
    const analytics = queueFactory(this, this.config, {
      name: ['analytics'],
      tags: {},
      messageRetentionSeconds: Duration.days(7).toSeconds(),
      resources: {
        kmsKey: refs.kms,
      },
      deadLetterQueue: {
        maxRetries: 3,
      },
    });

    return {
      incoming,
      processing,
      dispatch,
      analytics,
    };
  }

  protected codeSigning() {
    const profile = new SigningProfile(this, this.config.utils.namingHelperSnakeCase(`sp`), {
      platform: Platform.AWS_LAMBDA_SHA384_ECDSA,
    });

    const config = new CodeSigningConfig(this, this.config.utils.namingHelper(`sc`), {
      signingProfiles: [profile],
      untrustedArtifactOnDeployment: UntrustedArtifactOnDeployment.WARN,
    });

    return {
      profile,
      config,
    };
  }

  protected SSM<T extends Record<string, string | object>>(values: T) {
    const parameters = {} as Record<keyof T, StringParameter>;
    for (const [key, value] of Object.entries(values)) {
      // Create param
      const param = new StringParameter(this, key, {
        parameterName: `/${this.config.utils.namingHelper()}/${key}`,
        stringValue: typeof value == 'string' ? value : this.toJsonString(value),
        simpleName: false,
      });

      // Save into dict
      parameters[key as keyof T] = param;
    }
    return parameters;
  }

  protected dynamoDB(refs: { kms: ReturnType<UNS['kms']> }) {
    const messages = dynamodbFactory(this, this.config, {
      name: ['messages'],
      partitionKey: `NotificationID`,
      partitionKeyType: AttributeType.STRING,

      pointInTimeRecovery: true,
      ttlAttribute: 'ExpirationDateTime',

      resources: {
        kms: refs.kms,
      },
      globalSecondaryIndexes: [
        {
          name: 'DepartmentIDIndex',
          hashKey: 'NotificationID',
          rangeKey: 'DepartmentID',
          projectionType: ProjectionType.KEYS_ONLY,
        },
      ],
    });
    const campaigns = dynamodbFactory(this, this.config, {
      name: ['campaigns'],
      partitionKey: `CompositeID`,
      partitionKeyType: AttributeType.STRING,

      pointInTimeRecovery: true,

      resources: {
        kms: refs.kms,
      },

      globalSecondaryIndexes: [],
    });
    return { messages, campaigns };
  }

  protected elasticache(refs: { kms: ReturnType<UNS['kms']>; vpc: ReturnType<UNS['vpc']> }) {
    // IAM User
    const user = new elasticache.CfnUser(this, this.config.utils.namingHelper(`elch`, `iam`).split(`-`).join(``), {
      engine: 'valkey',
      userId: this.config.utils.namingHelper(`elch`, `iam`).split(`-`).join(``),
      userName: this.config.utils.namingHelper(`elch`, `iam`).split(`-`).join(``),
      authenticationMode: {
        Type: 'iam',
      },
      accessString: 'on ~* +@all',
    });

    // Assigning user to group
    const group = new elasticache.CfnUserGroup(
      this,
      this.config.utils.namingHelper(`elch`, `group`).split(`-`).join(``),
      {
        engine: 'valkey',
        userGroupId: this.config.utils.namingHelper(`elch`, `group`).split(`-`).join(``),
        userIds: [user.userId],
      }
    );
    group.addDependency(user);

    // Creating an elasticache with the group
    const cache = new elasticache.CfnServerlessCache(this, this.config.utils.namingHelper(`elch`, `main`), {
      engine: 'valkey',
      serverlessCacheName: this.config.utils.namingHelper(`elch`, `main`),
      subnetIds: refs.vpc.vpc.privateSubnets.map((s) => s.subnetId),
      securityGroupIds: [refs.vpc.securityGroups.privateEgress.securityGroupId],
      majorEngineVersion: '8',
      userGroupId: group,
      kmsKeyId: refs.kms.keyId,
      dailySnapshotTime: '4:00',
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
    cache.addDependency(group);

    return {
      cache,
      group,
      user,
      arns: [cache.attrArn, user.attrArn, cache.attrArn],
    };
  }

  protected psoLambdas(refs: {
    codeSigning: ReturnType<UNS['codeSigning']>;
    kms: ReturnType<UNS['kms']>;
    queues: ReturnType<UNS['queues']>;
    vpc: ReturnType<UNS['vpc']>;
    dynamoDB: ReturnType<UNS['dynamoDB']>;
    elasticache: ReturnType<UNS['elasticache']>;
  }) {
    const mtlsCertificateRevocationAuthorizer = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`mtlsCertificateRevocationAuthorizer`],
      bundlePath: './../../dist/pso/http.mtlsCertificateRevocationAuthorizer',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.utils.namespace()],
        dynamodb: {},
        kms: [],
      },
    });

    const getHealthcheck = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`getHealthcheck`],
      bundlePath: './../../dist/pso/http.getHealthcheck',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.utils.namespace()],
      },
    });

    const getNotificationStatus = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`getNotificationStatus`],
      bundlePath: './../../dist/pso/http.getNotificationStatus',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.utils.namespace()],
        dynamodb: {
          messages: {
            arn: refs.dynamoDB.messages.table.tableArn,
            read: true,
            write: false,
            scan: false,
          },
        },
      },
    });

    const postMessage = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`postMessage`],
      bundlePath: './../../dist/pso/http.postMessage',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.utils.namespace()],
        sqsSend: [refs.queues.processing.queue.queueArn, refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: {
            arn: refs.dynamoDB.messages.table.tableArn,
            read: true,
            write: true,
            scan: false,
          },
        },
      },
    });

    const validation = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`validation`],
      bundlePath: './../../dist/pso/sqs.validation',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
        dlq: refs.queues.incoming.dlq,
      },
      iam: {
        ssmNamespaces: [this.config.utils.namespace()],
        sqsSend: [refs.queues.processing.queue.queueArn, refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: {
            arn: refs.dynamoDB.messages.table.tableArn,
            read: true,
            write: true,
            scan: false,
          },
        },
      },
      triggers: {
        queues: [refs.queues.incoming.queue],
      },
    });

    const processing = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`processing`],
      bundlePath: './../../dist/pso/sqs.processing',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
        dlq: refs.queues.processing.dlq,
        vpc: {
          ref: refs.vpc.vpc,
          securityGroups: [refs.vpc.securityGroups.privateEgress],
          subnets: refs.vpc.vpc.privateSubnets,
        },
      },
      iam: {
        ssmNamespaces: [this.config.utils.namespace()],
        sqsSend: [refs.queues.dispatch.queue.queueArn, refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: {
            arn: refs.dynamoDB.messages.table.tableArn,
            read: true,
            write: true,
            scan: false,
          },
        },
        elasticache: refs.elasticache.arns,
      },
      triggers: {
        queues: [refs.queues.processing.queue],
      },
    });

    const dispatch = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`dispatch`],
      bundlePath: './../../dist/pso/sqs.dispatch',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
        vpc: {
          ref: refs.vpc.vpc,
          securityGroups: [refs.vpc.securityGroups.privateEgress],
          subnets: refs.vpc.vpc.privateSubnets,
        },
        dlq: refs.queues.dispatch.dlq,
      },
      iam: {
        ssmNamespaces: [this.config.utils.namespace()],
        sqsSend: [refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: {
            arn: refs.dynamoDB.messages.table.tableArn,
            read: true,
            write: true,
            scan: false,
          },
        },
        elasticache: refs.elasticache.arns,
      },
      triggers: {
        queues: [refs.queues.dispatch.queue],
      },
    });

    const analytics = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: ['analytics'],
      bundlePath: './../../dist/pso/sqs.analytics',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
        dlq: refs.queues.analytics.dlq,
        vpc: {
          ref: refs.vpc.vpc,
          securityGroups: [refs.vpc.securityGroups.privateEgress],
          subnets: refs.vpc.vpc.privateSubnets,
        },
      },
      iam: {
        ssmNamespaces: [this.config.utils.namespace()],
        dynamodb: {
          messages: {
            arn: refs.dynamoDB.messages.table.tableArn,
            read: true,
            write: true,
            scan: false,
          },
          campaigns: {
            arn: refs.dynamoDB.campaigns.table.tableArn,
            read: true,
            write: true,
            scan: false,
          },
        },
        elasticache: refs.elasticache.arns,
      },
      triggers: {
        queues: [refs.queues.analytics.queue],
      },
    });

    return {
      authorizers: { mtlsCertificateRevocationAuthorizer },
      http: {
        getHealthcheck,
        getNotificationStatus,
        postMessage,
      },
      sqs: {
        validation,
        processing,
        dispatch,
        analytics,
      },
    };
  }

  constructor(
    scope: Construct,
    protected id: string,
    protected props: StackProps,
    protected config: EnvVars
  ) {
    super(scope, id, props);

    config.utils.tagsHelper(scope);

    const kms = this.kms();
    const vpc = this.vpc();
    const queues = this.queues({ kms });
    const dynamoDB = this.dynamoDB({ kms });
    const elasticache = this.elasticache({ kms, vpc });

    // SSM Setup values
    this.SSM({
      // Elasticache
      'config/common/cache/name': elasticache.cache.serverlessCacheName,
      'config/common/cache/host': elasticache.cache.attrEndpointAddress,
      'config/common/cache/user': elasticache.user.userName,

      // DynamoDB Tables
      'table/inbound/attributes': dynamoDB.messages.attributes,
      'table/campaigns/attributes': dynamoDB.campaigns.attributes,

      // TODO: Dynamodb (Messages / mTLS) refs
      // SQS Qeueue refs
      'queue/processing/url': queues.processing.queue.queueUrl,
      'queue/dispatch/url': queues.dispatch.queue.queueUrl,
      'queue/analytics/url': queues.analytics.queue.queueUrl,
    });

    // Lambdas - PSO
    const codeSigning = this.codeSigning();
    const psoLambdas = this.psoLambdas({ codeSigning, kms, queues, vpc, dynamoDB, elasticache });

    const authorizer = new RequestAuthorizer(this, config.utils.namingHelper(`mtlsRequestAuthorizer`), {
      identitySources: [IdentitySource.context(`identity.clientCert.clientCertPem`)],
      handler: psoLambdas.authorizers.mtlsCertificateRevocationAuthorizer.fn,
      resultsCacheTtl: Duration.seconds(0),
    });

    const psoGateway = apiGatewayFactory(this, config, {
      name: [`pso`],
      domain: `pso-cdk`,
      resources: {
        authorizers: [],
      },
      type: 'PUBLIC',
      integrations: {
        getHealthcheck: {
          path: `status`,
          method: HttpMethod.GET,
          integration: psoLambdas.http.getHealthcheck.fnIntegration,
        },
        getHealthcheckAuth: {
          path: `statusauth`,
          method: HttpMethod.GET,
          integration: psoLambdas.http.getHealthcheck.fnIntegration,
          authorizer: authorizer,
        },
        getNotificationStatus: {
          path: `status/{notificationID}`,
          method: HttpMethod.GET,
          integration: psoLambdas.http.getNotificationStatus.fnIntegration,
        },
        postMessage: {
          path: `send`,
          method: HttpMethod.POST,
          integration: psoLambdas.http.postMessage.fnIntegration,
        },
      },
    });
  }
}
