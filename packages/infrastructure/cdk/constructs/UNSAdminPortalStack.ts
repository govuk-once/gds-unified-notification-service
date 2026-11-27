import { EnvVars } from '@infra/cdk/config';
import { UNSAPIGatewayGateway } from '@infra/cdk/constructs/bases/UNSApiGatewayConstruct';
import { UNSKMSConstruct } from '@infra/cdk/constructs/bases/UNSKMSConstruct';
import { UNSLambdaConstruct } from '@infra/cdk/constructs/bases/UNSLambdaConstruct';
import { UNSCommon } from '@infra/cdk/constructs/UNSCommon';
import { UNSGlobalStack } from '@infra/cdk/constructs/UNSGlobalStack';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class UNSAdminPortalStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps,
    config: EnvVars,
    resources: { global: UNSGlobalStack; common: UNSCommon }
  ) {
    super(scope, id, props);

    // Define KMS key
    const kms = new UNSKMSConstruct(this, config, {
      name: ['kms', 'portal'],
      policies: {
        root: true,
        lambdas: true,
        cloudwatch: true,
      },
    }).key;

    // Lambdas
    const serviceName = 'portal-backend';
    const baseHTTP = UNSLambdaConstruct.baseHTTPFactory(serviceName, resources.common.codeSigning);

    const getHealthcheck = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`getHealthcheck`),
      environment: {},
      resources: {
        kms: kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
      },
    });

    // Define API Gateway
    const gateway = new UNSAPIGatewayGateway(this, config, {
      type: 'PUBLIC',
      name: [`portal`],
      description: `API Gateway for Admin Portal`,
      domain: 'portal',
      waf: {
        cloudfrontWebAclArn: resources.global.cloudfrontWebAclArn,
      },
      resources: {
        kms,
      },
    }).GET(`getStatusV1`, `/v1/status`, getHealthcheck.integration);
  }
}
