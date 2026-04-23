import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { vpcFactory } from 'infrastructure/cdk/factories/vpcFactory';

export class Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps, config: EnvVars) {
    super(scope, id, props);

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
  }
}
