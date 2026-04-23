import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
import { Duration, Stack, StackProps } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { kmsKeyFactory } from 'infrastructure/cdk/factories/kmsKeyFactory';
import { queueFactory } from 'infrastructure/cdk/factories/sqsFactory';
import { vpcFactory } from 'infrastructure/cdk/factories/vpcFactory';

export class UNS extends Stack {
  constructor(scope: Construct, id: string, props: StackProps, config: EnvVars) {
    super(scope, id, props);

    config.utils.tagsHelper(scope);

    // KMS
    const key = kmsKeyFactory(this, config, {
      name: ['kms', 'main'],
      policies: {
        root: true,
        lambdas: true,
        cloudwatch: true,
      },
    });

    // VPC
    const vpc = vpcFactory(this, config, {
      name: 'main',
      cidr: config.vpc.cidr,
      zones: config.vpc.zones,
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

    // SQS Queues
    const sqsIncomingQueue = queueFactory(this, config, {
      name: ['incoming'],
      tags: {},
      messageRetentionSeconds: Duration.days(7).toSeconds(),
      resources: {
        kmsKey: key,
      },
      deadLetterQueue: {
        maxRetries: 3,
      },
    });
    const sqsProcessingQueue = queueFactory(this, config, {
      name: ['processing'],
      tags: {},
      messageRetentionSeconds: Duration.days(7).toSeconds(),
      resources: {
        kmsKey: key,
      },
      deadLetterQueue: {
        maxRetries: 3,
      },
    });
    const sqsDispatchQueue = queueFactory(this, config, {
      name: ['dispatch'],
      tags: {},
      messageRetentionSeconds: Duration.days(7).toSeconds(),
      resources: {
        kmsKey: key,
      },
      deadLetterQueue: {
        maxRetries: 3,
      },
    });
    const sqsAnalyticsQueue = queueFactory(this, config, {
      name: ['analytics'],
      tags: {},
      messageRetentionSeconds: Duration.days(7).toSeconds(),
      resources: {
        kmsKey: key,
      },
      deadLetterQueue: {
        maxRetries: 3,
      },
    });
  }
}
