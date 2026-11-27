import { EnvVars } from '@infra/cdk/config';
import { UNSAPIGatewayGateway } from '@infra/cdk/constructs/bases/UNSApiGatewayConstruct';
import { UNSCognitoConstruct } from '@infra/cdk/constructs/bases/UNSCognitoConstruct';
import { UNSKMSConstruct } from '@infra/cdk/constructs/bases/UNSKMSConstruct';
import { UNSLambdaConstruct } from '@infra/cdk/constructs/bases/UNSLambdaConstruct';
import { UNSCommon } from '@infra/cdk/constructs/UNSCommon';
import { UNSGlobalStack } from '@infra/cdk/constructs/UNSGlobalStack';
import { SSMFromObject } from '@infra/cdk/utils/SSMFromObject';
import SSMParameters from '@shared/ssmParameter';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { resolve } from 'node:path';

export class UNSAdminPortalStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps,
    config: EnvVars,
    resources: { global: UNSGlobalStack; common: UNSCommon }
  ) {
    super(scope, id, props);

    const kms = new UNSKMSConstruct(this, config, {
      name: ['kms', 'portal'],
      policies: {
        root: true,
        lambdas: true,
        cloudwatch: true,
      },
    }).key;

    const portalBaseUrl = `https://${config.isPersistentEnv ? 'portal' : config.utils.namingHelper('portal')}.${config.ssm.hostedZoneName}`;

    const cognito = new UNSCognitoConstruct(this, config, {
      portalBaseUrl,
      cssPath: resolve(import.meta.dirname, '../assets/cognito-portal.css'),
    });

    const serviceName = 'portal-backend';
    const baseHTTP = UNSLambdaConstruct.baseHTTPFactory(serviceName, resources.common.codeSigning);

    const getHealthcheck = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`getHealthcheck`),
      environment: {},
      resources: { kms },
      iam: { ssmNamespaces: [config.namespace] },
    });

    new UNSAPIGatewayGateway(this, config, {
      type: 'PUBLIC',
      name: [`portal`],
      description: `API Gateway for Admin Portal`,
      domain: 'portal',
      waf: {
        cloudfrontWebAclArn: config.isEphemeral ? undefined : resources.global.cloudfrontWebAclArn,
      },
      resources: { kms },
    }).GET(`getStatusV1`, `/v1/status`, getHealthcheck.integration);

    SSMFromObject(this, config, {
      [SSMParameters.Portal.Cognito.UserPoolId.Path]: cognito.userPool.userPoolId,
      [SSMParameters.Portal.Cognito.UserPoolClientId.Path]: cognito.userPoolClient.userPoolClientId,
      [SSMParameters.Portal.Cognito.Domain.Path]: cognito.domainBaseUrl,
      [SSMParameters.Portal.Cognito.SignInUrl.Path]: cognito.signInUrl,
    });
  }
}
