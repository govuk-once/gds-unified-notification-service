import { Duration, Stack } from 'aws-cdk-lib';
import { IdentitySource, RequestAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { Dashboard } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Rule, Schedule } from "aws-cdk-lib/aws-events"
import * as s3 from 'aws-cdk-lib/aws-s3';

import { EnvVars } from 'infrastructure/cdk/config';
import { UNSAPIGatewayGateway } from 'infrastructure/cdk/constructs/bases/UNSApiGatewayConstruct';
import { UNSDynamoDb } from 'infrastructure/cdk/constructs/bases/UNSDynamoDBConstruct';
import { UNSLambdaConstruct } from 'infrastructure/cdk/constructs/bases/UNSLambdaConstruct';
import { UNSQueueConstruct } from 'infrastructure/cdk/constructs/bases/UNSQueueConstruct';
import { UNSPSOFlow } from 'infrastructure/cdk/constructs/dashboards/UNSPSOFlow';
import { UNSPSOUtilization } from 'infrastructure/cdk/constructs/dashboards/UNSPSOUtilization';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { getConsumers } from 'infrastructure/cdk/consumers/consumers';
import { SSMFromObject } from 'infrastructure/cdk/utils/SSMFromObject';
import { StandardServiceDashboardFactory } from 'once-platform-constructs';
import { applyCheckovSkips } from 'infrastructure/cdk/utils/applyCheckovSkip';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { PolicyStatement, Effect, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export class UNSPSOResource extends Construct {
  public readonly serviceName = 'pso';
  public readonly queues: {
    incoming: UNSQueueConstruct;
    processing: UNSQueueConstruct;
    dispatch: UNSQueueConstruct;
    analytics: UNSQueueConstruct;
  };
  public readonly lambdas: {
    authorizers: { mtlsCertificateRevocationAuthorizer: UNSLambdaConstruct };
    http: {
      getHealthcheck: UNSLambdaConstruct;
      getNotificationStatus: UNSLambdaConstruct;
      getCampaignStatus: UNSLambdaConstruct;
      postMessage: UNSLambdaConstruct;
    };
    sqs: {
      validation: UNSLambdaConstruct;
      processing: UNSLambdaConstruct;
      dispatch: UNSLambdaConstruct;
      analytics: UNSLambdaConstruct;
    };
    schedule: {
      bqAnalyticsExport: UNSLambdaConstruct
    }
  };
  public readonly gateway: UNSAPIGatewayGateway;
  public readonly dashboards: {
    flow: UNSPSOFlow;
    utilization: UNSPSOUtilization;
    service: Dashboard;
  };

  constructor(
    scope: Construct,
    config: EnvVars,
    props: {
      refs: UNSCommon;
      mtls: {
        revocationTableArn: string;
        revocationTableAttributes: object;
        truststorePath: string;
        dependencies: Construct[];
      };
    }
  ) {
    const { constructNamingHelper, namingHelper } = config.utils;
    super(scope, 'pso');

    const { refs } = props;

    //// =====================================================
    // SQS Queues
    //// =====================================================
    this.queues = {
      analytics: refs.queues.analytics,
      //
      incoming: new UNSQueueConstruct(this, config, {
        name: ['incoming'],
        tags: {},
        messageRetentionSeconds: Duration.days(7).toSeconds(),
        resources: {
          kmsKey: refs.kms,
        },
        deadLetterQueue: {
          maxRetries: 3,
        },
      }),
      processing: new UNSQueueConstruct(this, config, {
        name: ['processing'],
        tags: {},
        messageRetentionSeconds: Duration.days(7).toSeconds(),
        resources: {
          kmsKey: refs.kms,
        },
        deadLetterQueue: {
          maxRetries: 3,
        },
      }),
      dispatch: new UNSQueueConstruct(this, config, {
        name: ['dispatch'],
        tags: {},
        messageRetentionSeconds: Duration.days(7).toSeconds(),
        resources: {
          kmsKey: refs.kms,
        },
        deadLetterQueue: {
          maxRetries: 3,
        },
      }),
    };

    // //// =====================================================
    // // Log Groups
    // //// =====================================================
    const bqAnalyticsExportLogGroup = new LogGroup(this, constructNamingHelper('lg', `bq-analytics-export`), {
      logGroupName: `/aws/export/${namingHelper('bq-analytics-export')}`,
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: refs.kms,
      removalPolicy: config.removalPolicy,
    });

    // //// =====================================================
    // // S3 Buckets
    // //// =====================================================
    const bqAnalyticsExportBucket = new s3.Bucket(this, constructNamingHelper(`bq-analytics-export`, ` bucket`), {
      bucketName: namingHelper(`bq-analytics-export`),
      // Encryption at rest (Uses Amazon S3-managed keys / SSE-S3)
      encryption: s3.BucketEncryption.S3_MANAGED,

      // Make it strictly private by blocking all public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      // Security best practice: Enforce TLS/HTTPS for data in transit
      enforceSSL: true,

      // Enable versioning
      versioned: true,

      // Teardown lifecycle configuration (Change to RETAIN for production data)
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: !config.isMainEnv,

      lifecycleRules: [{
        enabled: true,
        expiration: config.isMainEnv ? Duration.days(7) : Duration.days(1),
      }]
    });
    applyCheckovSkips(bqAnalyticsExportBucket, [
      ['CKV_AWS_18', 'Access logs may not be necessary for this bucket - as it should covered by cloudtrail'],
    ]);

    bqAnalyticsExportBucket.addToResourcePolicy(new PolicyStatement({
      sid: 'AllowCloudWatchLogsGetAcl',
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal('logs.eu-west-2.amazonaws.com')],
      actions: ['s3:GetBucketAcl'],
      resources: [bqAnalyticsExportBucket.bucketArn],
    }))

    bqAnalyticsExportBucket.addToResourcePolicy(new PolicyStatement({
      sid: 'AllowCloudWatchLogsPutObject',
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal('logs.eu-west-2.amazonaws.com')],
      actions: ['s3:PutObject'],
      resources: [bqAnalyticsExportBucket.arnForObjects('*')],
      // conditions: {
      //   StringEquals: {
      //     's3:x-amz-acl': 'bucket-owner-full-control',
      //   },
      // },
    }));

    //// =====================================================
    // Lambdas
    //// =====================================================

    const baseHTTP = UNSLambdaConstruct.baseHTTPFactory(this.serviceName, refs.codeSigning);
    const baseSQS = UNSLambdaConstruct.baseSQSFactory(this.serviceName, refs.codeSigning);
    const baseSchedule = UNSLambdaConstruct.baseScheduleFactory(this.serviceName, refs.codeSigning);
    const basePrivateVPC = {
      ref: refs.vpc.vpc,
      securityGroups: [refs.vpc.securityGroups.privateEgress],
      subnets: refs.vpc.vpc.privateSubnets,
    };
    const mtlsCertificateRevocationAuthorizer = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`mtlsCertificateRevocationAuthorizer`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        dynamodb: {
          revocationTable: UNSDynamoDb.createPermissionMapping(props.mtls.revocationTableArn, true, false, false),
        },
        // Sandbox use case: Allow authorizer to use decrypt on mtls tables
        kms: config.isMainEnv ? [] : [config.sandbox.shared.kms],
      },
    });

    const getHealthcheck = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`getHealthcheck`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
      },
    });

    const getNotificationStatus = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`getNotificationStatus`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readOnlyById,
        },
      },
    });

    const getCampaignStatus = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`getCampaignStatus`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        dynamodb: {
          messages: refs.dynamodb.campaigns.permissions.readOnlyById,
        },
      },
    });

    const postMessage = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`postMessage`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        sqsSend: [this.queues.processing.queue.queueArn, this.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readAndWrite,
        },
      },
    });

    const validation = new UNSLambdaConstruct(this, config, {
      ...baseSQS(`validation`),
      environment: {},
      resources: {
        kms: refs.kms,
        dlq: this.queues.incoming.dlq,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        sqsSend: [this.queues.processing.queue.queueArn, this.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readAndWrite,
          campaigns: refs.dynamodb.campaigns.permissions.readAndWrite,
        },
      },
      triggers: {
        queues: [this.queues.incoming.queue],
      },
    });

    const processing = new UNSLambdaConstruct(this, config, {
      ...baseSQS(`processing`),
      environment: {},
      resources: {
        kms: refs.kms,
        dlq: this.queues.processing.dlq,
        vpc: basePrivateVPC,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        sm: config.ssm.udp.sm ? [config.ssm.udp.sm] : [],
        kms: config.ssm.udp.kms ? [config.ssm.udp.kms] : [],
        assumeableRolesArns: config.ssm.udp.role ? [config.ssm.udp.role] : [],
        sqsSend: [this.queues.dispatch.queue.queueArn, this.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readAndWrite,
        },
        elasticache: refs.elasticache.arns,
      },
      triggers: {
        queues: [this.queues.processing.queue],
      },
    });

    const dispatch = new UNSLambdaConstruct(this, config, {
      ...baseSQS(`dispatch`),
      environment: {},
      resources: {
        kms: refs.kms,
        vpc: basePrivateVPC,
        dlq: this.queues.dispatch.dlq,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        sqsSend: [this.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readAndWrite,
        },
        elasticache: refs.elasticache.arns,
      },
      triggers: {
        queues: [this.queues.dispatch.queue],
      },
    });

    const analytics = new UNSLambdaConstruct(this, config, {
      ...baseSQS(`analytics`),
      environment: {},
      resources: {
        kms: refs.kms,
        dlq: this.queues.analytics.dlq,
        vpc: basePrivateVPC,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readAndWrite,
          campaigns: refs.dynamodb.campaigns.permissions.readAndWrite,
        },
        elasticache: refs.elasticache.arns,
        cloudwatch: [bqAnalyticsExportLogGroup.logGroupArn],
      },
      triggers: {
        queues: [this.queues.analytics.queue],
      },
    });

    const bqAnalyticsExport = new UNSLambdaConstruct(this, config, {
      ...baseSchedule(`bqAnalyticsExport`),
      environment: {},
      resources: {
        kms: refs.kms,
        dlq: this.queues.analytics.dlq, // Does it need dlq
        vpc: basePrivateVPC,  // Does it need to be in VPC
      },
      iam: {
        ssmNamespaces: [config.namespace],
        cloudwatch: [bqAnalyticsExportLogGroup.logGroupArn],
        cloudwatchExport: [bqAnalyticsExportLogGroup.logGroupArn],
        s3: [bqAnalyticsExportBucket.bucketArn]
      },
    });

    this.lambdas = {
      authorizers: { mtlsCertificateRevocationAuthorizer },
      http: {
        getHealthcheck,
        getNotificationStatus,
        getCampaignStatus,
        postMessage,
      },
      sqs: {
        validation,
        processing,
        dispatch,
        analytics,
      },
      schedule: {
        bqAnalyticsExport
      }
    };

    //// =====================================================
    // Scheduler
    //// =====================================================
    // TODO: Could this be moved in lambda construct
    new Rule(this, config.utils.namingHelper(`scheduler`, this.lambdas.schedule.bqAnalyticsExport.props.serviceName), {
      schedule: Schedule.cron({ minute: "30", hour: "*" }),
      targets: [new LambdaFunction(bqAnalyticsExport.fn)]
    });

    //// =====================================================
    // API Gateway
    //// =====================================================

    // Define authorizer
    const authorizer = new RequestAuthorizer(this, config.utils.namingHelper(`mtlsRequestAuthorizer`), {
      identitySources: [IdentitySource.context(`identity.clientCert.clientCertPem`)],
      handler: this.lambdas.authorizers.mtlsCertificateRevocationAuthorizer.fn,
      resultsCacheTtl: Duration.seconds(0),
    });

    // Define API Gateway
    this.gateway = new UNSAPIGatewayGateway(this, config, {
      name: [`pso`],
      description: `API Gateway for PSOs`,
      domain: 'pso',
      mtls: {
        truststore: props.mtls.truststorePath,
      },
      resources: {
        kms: refs.kms,
      },
      authorizer: authorizer,
      type: 'PUBLIC',

      // Initial implementation - create consumers for every
      usagePlanDefaults: {
        throttle: {
          rateLimit: 500,
          burstLimit: 1000,
        },
        quota: {
          limit: 20000,
        },
      },
      usagePlans: getConsumers(config.env, config)
        .map((consumer) => ({ [consumer.organization]: {} }))
        .reduce((a, b) => ({ ...a, ...b })),
    })
      .GET(`getHealthcheck`, `/status`, this.lambdas.http.getHealthcheck.integration)
      .GET(`getNotificationStatus`, `/status/{notificationID}`, this.lambdas.http.getNotificationStatus.integration)
      .GET(`getCampaignStatus`, `/status/campaign/{campaignID}`, this.lambdas.http.getCampaignStatus.integration)
      .POST(`postMessage`, `/send`, this.lambdas.http.postMessage.integration);

    for (const dependency of props.mtls.dependencies ?? []) {
      this.gateway.node.addDependency(dependency);
    }

    //// =====================================================
    // Xray Dashboards
    //// =====================================================
    this.dashboards = {
      utilization: new UNSPSOUtilization(this, `pso-utilization-dashboard`, config, {
        pso: this,
      }),
      flow: new UNSPSOFlow(this, `pso-flow-dashboard`, config, {
        pso: this,
      }),
      service: new StandardServiceDashboardFactory(
        this,
        `pso`,
        undefined,
        undefined,
        config.utils.namingProvider()
      ).createDashboard(`pso-service`, {
        lambdas: [
          ...Object.values(this.lambdas.http),
          ...Object.values(this.lambdas.sqs),
          ...Object.values(this.lambdas.authorizers),
        ].map((x) => x.fn),
        name: config.utils.namingHelper(`pso-service`),
        restApis: [this.gateway.restApi],
        tables: [refs.dynamodb.campaigns.table, refs.dynamodb.messages.table],
      }),
    };

    //// =====================================================
    // SSM Values
    //// =====================================================

    // SSM Setup values - PSO
    SSMFromObject(Stack.of(this), config, {
      // DynamoDB Tables
      // mTLS refs
      'table/mtls/attributes': props.mtls.revocationTableAttributes,

      // SQS Queue refs
      'queue/processing/url': this.queues.processing.queue.queueUrl,
      'queue/dispatch/url': this.queues.dispatch.queue.queueUrl,

      // BigQuery Analytics export
      'bigquery/analytics/loggroup/name': bqAnalyticsExportLogGroup.logGroupName,
      'bigquery/analytics/bucket/name': bqAnalyticsExportBucket.bucketName,
    })
  }
}
