import { IdentitySource, LambdaIntegration, RequestAuthorizer } from 'aws-cdk-lib/aws-apigateway';
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

  protected SSM<T extends Record<string, string | undefined | object>>(values: T) {
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
        ssmNamespaces: [this.config.namespace],
        dynamodb: {
          // If mtls table reference is present in config - give this authorizer a permission to read it
          ...(this.config.ssm.mtls.table?.arn
            ? {
                mtlsRevocationTable: {
                  arn: this.config.ssm.mtls.table?.arn,
                  read: true,
                  write: false,
                  scan: false,
                },
              }
            : {}),
        },
        kms: this.config.ssm.mtls.kms ? [this.config.ssm.mtls.kms] : [],
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
        ssmNamespaces: [this.config.namespace],
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
        ssmNamespaces: [this.config.namespace],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readOnlyById,
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
        ssmNamespaces: [this.config.namespace],
        sqsSend: [refs.queues.processing.queue.queueArn, refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readAndWrite,
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
        ssmNamespaces: [this.config.namespace],
        sqsSend: [refs.queues.processing.queue.queueArn, refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readAndWrite,
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
        ssmNamespaces: [this.config.namespace],
        sqsSend: [refs.queues.dispatch.queue.queueArn, refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readAndWrite,
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
        ssmNamespaces: [this.config.namespace],
        sqsSend: [refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readAndWrite,
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
        ssmNamespaces: [this.config.namespace],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readAndWrite,
          campaigns: refs.dynamoDB.campaigns.permissions.readAndWrite,
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

  protected psoAPIGateway(refs: { psoLambdas: ReturnType<UNS['psoLambdas']>; kms: ReturnType<UNS['kms']> }) {
    const { http } = refs.psoLambdas;

    // Define authorizer
    const authorizer = new RequestAuthorizer(this, this.config.utils.namingHelper(`mtlsRequestAuthorizer`), {
      identitySources: [IdentitySource.context(`identity.clientCert.clientCertPem`)],
      handler: refs.psoLambdas.authorizers.mtlsCertificateRevocationAuthorizer.fn,
      resultsCacheTtl: Duration.seconds(0),
    });

    const operation = <OperationID extends string>(
      operationID: OperationID,
      method: HttpMethod,
      path: string,
      integration: LambdaIntegration
    ) => {
      return {
        [operationID]: {
          path,
          method,
          integration,
        },
      } as Record<OperationID, { path: typeof path; method: HttpMethod; integration: LambdaIntegration }>;
    };

    // Define API Gateway
    const gateway = apiGatewayFactory(this, this.config, {
      name: [`pso`],
      domain: `pso-cdk`,
      mtls:
        this.config.mtls && this.config.ssm.mtls.truststore
          ? {
              truststore: this.config.ssm.mtls.truststore,
            }
          : undefined,
      resources: {
        authorizers: [],
        kms: refs.kms,
      },
      authorizer: authorizer,
      type: 'PUBLIC',
      integrations: {
        ...operation('getHealthcheck', HttpMethod.GET, '/status', http.getHealthcheck.integration),
        ...operation(
          'getNotificationStatus',
          HttpMethod.GET,
          '/status/{notificationID}',
          http.getNotificationStatus.integration
        ),
        ...operation('postMessage', HttpMethod.POST, '/send', http.postMessage.integration),
      },
    });

    return gateway;
  }

  protected flexLambdas(refs: {
    codeSigning: ReturnType<UNS['codeSigning']>;
    kms: ReturnType<UNS['kms']>;
    queues: ReturnType<UNS['queues']>;
    vpc: ReturnType<UNS['vpc']>;
    dynamoDB: ReturnType<UNS['dynamoDB']>;
    elasticache: ReturnType<UNS['elasticache']>;
  }) {
    // Helper definitions
    const serviceName = 'flex';
    const bundlePath = (operationId: string) => `./../../dist/flex/http.${operationId}`;
    const base = (operationId: string) => ({
      serviceName,
      name: [operationId],
      bundlePath: bundlePath(operationId),
      signingConfig: refs.codeSigning.config,
    });

    // /notifications
    const getNotifications = lambdaFactory(this, this.config, {
      ...base(`getNotifications`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.namespace],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readOnly,
        },
      },
    });

    // GET /notifications/{notificationID}
    const getNotificationById = lambdaFactory(this, this.config, {
      ...base(`getNotificationById`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.namespace],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readOnlyById,
        },
      },
    });

    // PATCH /notifications/{notificationID}/status
    const patchNotification = lambdaFactory(this, this.config, {
      ...base(`patchNotification`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.namespace],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readOnlyById,
        },
      },
    });

    // DELETE /notifications/{notificationID}
    const deleteNotification = lambdaFactory(this, this.config, {
      ...base(`deleteNotification`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.namespace],
        sqsSend: [refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamoDB.messages.permissions.readOnlyById,
        },
      },
    });

    return {
      http: {
        getNotifications,
        getNotificationById,
        patchNotification,
        deleteNotification,
      },
    };
  }

  protected flexAPIGateway(refs: { flexLambdas: ReturnType<UNS['flexLambdas']>; kms: ReturnType<UNS['kms']> }) {
    const { http } = refs.flexLambdas;

    const operation = <OperationID extends string>(
      operationID: OperationID,
      method: HttpMethod,
      path: string,
      integration: LambdaIntegration
    ) => {
      return {
        [operationID]: {
          path,
          method,
          integration,
        },
      } as Record<OperationID, { path: typeof path; method: HttpMethod; integration: LambdaIntegration }>;
    };

    // Define API Gateway
    const integrations = {
      ...operation('getNotifications', HttpMethod.GET, '/notifications', http.getNotifications.integration),
      ...operation(
        'getNotificationById',
        HttpMethod.GET,
        '/notifications/{notificationID}',
        http.getNotificationById.integration
      ),
      ...operation(
        'patchNotification',
        HttpMethod.PATCH,
        '/notifications/{notificationID}/status',
        http.patchNotification.integration
      ),
      ...operation(
        'deleteNotification',
        HttpMethod.DELETE,
        '/notifications/{notificationID}',
        http.deleteNotification.integration
      ),
    };

    // TODO - currently migrating to vpce connection - afterwards public API shall be depracated on shared environments & will only be used on developer sandboxes
    const publicRestAPI = apiGatewayFactory(this, this.config, {
      name: [`flex`],
      domain: `flex-cdk`,
      resources: {
        authorizers: [],
        kms: refs.kms,
      },
      type: 'PUBLIC',
      integrations,
    });

    const privateRestAPI = apiGatewayFactory(this, this.config, {
      name: [`flex-private`],
      resources: {
        authorizers: [],
        kms: refs.kms,
      },
      type: `PRIVATE`,
      integrations,
      iam:
        this.config.ssm.flex.account !== null && this.config.ssm.flex.vpce.length > 0
          ? {
              allowOnlyFromKnownSources: {
                awsAccountID: this.config.ssm.flex.account,
                vpceIDs: this.config.ssm.flex.vpce,
              },
            }
          : {},
    });

    return {
      publicRestAPI,
      privateRestAPI,
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
    const codeSigning = this.codeSigning();

    // SSM Setup values
    this.SSM({
      // Elasticache
      'config/common/cache/name': elasticache.cache.serverlessCacheName,
      'config/common/cache/host': elasticache.cache.attrEndpointAddress,
      'config/common/cache/user': elasticache.user.userName,

      // DynamoDB Tables
      'table/inbound/attributes': dynamoDB.messages.attributes,
      'table/campaigns/attributes': dynamoDB.campaigns.attributes,

      // mTLS refs
      'table/mtls/attributes': config.ssm.mtls
        ? {
            name: config.ssm.mtls.table?.name,
            ...(JSON.parse(config.ssm.mtls.table?.attributes ?? '{}') as Record<string, string>),
          }
        : undefined,

      // SQS Qeueue refs
      'queue/processing/url': queues.processing.queue.queueUrl,
      'queue/dispatch/url': queues.dispatch.queue.queueUrl,
      'queue/analytics/url': queues.analytics.queue.queueUrl,
    });

    // Lambdas - PSO
    const psoLambdas = this.psoLambdas({ codeSigning, kms, queues, vpc, dynamoDB, elasticache });
    const psoGateway = this.psoAPIGateway({ psoLambdas, kms });

    // Lambdas - FLEX
    const flexLambdas = this.flexLambdas({ codeSigning, kms, queues, vpc, dynamoDB, elasticache });
    const flexGateway = this.flexAPIGateway({ flexLambdas, kms });

    // Skips for resources generated by CDK

    // applyCheckovSkips(methodStruct, [
    //   ['CKV_AWS_59', '"Ensure there is no open access to back-end resources through API"'],
    // ]);
  }
}
