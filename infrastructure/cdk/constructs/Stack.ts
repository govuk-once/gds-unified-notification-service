import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
import { CodeSigningConfig, UntrustedArtifactOnDeployment } from 'aws-cdk-lib/aws-lambda';
import { Platform, SigningProfile } from 'aws-cdk-lib/aws-signer';
import { Duration, Stack, StackProps } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { kmsKeyFactory } from 'infrastructure/cdk/factories/kmsKeyFactory';
import { lambdaFactory } from 'infrastructure/cdk/factories/lambdaFactory';
import { queueFactory } from 'infrastructure/cdk/factories/sqsFactory';
import { vpcFactory } from 'infrastructure/cdk/factories/vpcFactory';

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

  protected psoLambdas(refs: {
    codeSigning: ReturnType<UNS['codeSigning']>;
    kms: ReturnType<UNS['kms']>;
    queues: ReturnType<UNS['queues']>;
  }) {
    const psoGetHealthcheck = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`getStatus`],
      bundlePath: './../../dist/pso/http.getHealthcheck',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.env],
      },
    });

    const psoGetNotificationStatus = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`getNotificationStatus`],
      bundlePath: './../../dist/pso/http.getNotificationStatus',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.env],
      },
    });

    const psoPostMessage = lambdaFactory(this, this.config, {
      serviceName: 'pso',
      name: [`postMessage`],
      bundlePath: './../../dist/pso/http.postMessage',
      signingConfig: refs.codeSigning.config,
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [this.config.env],
        sqsSend: [refs.queues.processing.queue.queueArn, refs.queues.analytics.queue.queueArn],
      },
    });

    return {
      psoGetHealthcheck,
      psoGetNotificationStatus,
      psoPostMessage,
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

    // Lambdas - PSO
    const codeSigning = this.codeSigning();
    const psoLambdas = this.psoLambdas({ codeSigning, kms, queues });
  }
}
