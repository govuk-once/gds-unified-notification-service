import { Duration, Stack } from 'aws-cdk-lib';
import { IdentitySource, RequestAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { UNSAPIGatewayGateway } from 'infrastructure/cdk/constructs/bases/UNSApiGatewayConstruct';
import { UNSLambdaConstruct } from 'infrastructure/cdk/constructs/bases/UNSLambdaConstruct';
import { UNSQueueConstruct } from 'infrastructure/cdk/constructs/bases/UNSQueueConstruct';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { UNSMTLSCommon } from 'infrastructure/cdk/constructs/UNSMTLS';
import { SSMFromObject } from 'infrastructure/cdk/utils/SSMFromObject';

export class UNSPSOResource extends Construct {
  public readonly serviceName = 'pso';
  public readonly queues: {
    incoming: UNSQueueConstruct;
    processing: UNSQueueConstruct;
    dispatch: UNSQueueConstruct;
    analytics: UNSQueueConstruct;
  };
  public readonly gateway: UNSAPIGatewayGateway;
  constructor(
    scope: Construct,
    config: EnvVars,
    props: {
      refs: UNSCommon;
      mtlsRefs: UNSMTLSCommon;
    }
  ) {
    super(scope, 'pso');

    const { refs, mtlsRefs } = props;

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

    //// =====================================================
    // Lambdas
    //// =====================================================

    const baseHTTP = UNSLambdaConstruct.baseHTTPFactory(this.serviceName, refs.codeSigning);
    const baseSQS = UNSLambdaConstruct.baseSQSFactory(this.serviceName, refs.codeSigning);
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
          revocationTable: mtlsRefs.revocationTable.permissions.readOnlyById,
        },
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
      },
      triggers: {
        queues: [this.queues.analytics.queue],
      },
    });

    const lambdas = {
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
    };

    //// =====================================================
    // Lambdas
    //// =====================================================

    // Define authorizer
    const authorizer = new RequestAuthorizer(this, config.utils.namingHelper(`mtlsRequestAuthorizer`), {
      identitySources: [IdentitySource.context(`identity.clientCert.clientCertPem`)],
      handler: lambdas.authorizers.mtlsCertificateRevocationAuthorizer.fn,
      resultsCacheTtl: Duration.seconds(0),
    });

    // Define API Gateway

    this.gateway = new UNSAPIGatewayGateway(this, config, {
      name: [`pso`],
      description: `API Gateway for PSOs`,
      domain: config.env !== 'stg' ? 'pso' : 'pso-cdk',
      mtls: {
        truststore: mtlsRefs.truststorePath,
      },
      resources: {
        kms: refs.kms,
      },
      authorizer: authorizer,
      type: 'PUBLIC',
    })
      .GET(`getHealthcheck`, `/status`, lambdas.http.getHealthcheck.integration)
      .GET(`getNotificationStatus`, `/status/{notificationID}`, lambdas.http.getNotificationStatus.integration)
      .GET(`getCampaignStatus`, `/status/campaign/{campaignID}`, lambdas.http.getCampaignStatus.integration)
      .POST(`postMessage`, `/send`, lambdas.http.postMessage.integration);

    this.gateway.node.addDependency(mtlsRefs.truststoreUpload);
    //// =====================================================
    // SSM Values
    //// =====================================================

    // SSM Setup values - PSO
    SSMFromObject(Stack.of(this), config, {
      // DynamoDB Tables
      // mTLS refs
      'table/mtls/attributes': mtlsRefs.revocationTable.attributes,

      // SQS Qeueue refs
      'queue/processing/url': this.queues.processing.queue.queueUrl,
      'queue/dispatch/url': this.queues.dispatch.queue.queueUrl,
    });
  }
}
