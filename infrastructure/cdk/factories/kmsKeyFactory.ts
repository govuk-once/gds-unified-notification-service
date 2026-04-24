import * as iam from 'aws-cdk-lib/aws-iam';
import { PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cdk from 'aws-cdk-lib/core';
import { Stack } from 'aws-cdk-lib/core';
import { EnvVars } from 'infrastructure/cdk/config';

export const kmsKeyFactory = (
  stack: Stack,
  config: EnvVars,
  props: {
    name: string[];
    policies: {
      root: boolean;
      lambdas: boolean;
      cloudwatch: boolean;
    };
  }
) => {
  const key = new kms.Key(stack, config.utils.namingHelper(...props.name), {
    enableKeyRotation: true,
    pendingWindow: cdk.Duration.days(30),
    policy: new PolicyDocument({
      statements: [
        // Enabling IAM User perms
        props.policies.root
          ? new PolicyStatement({
              principals: [new iam.AccountRootPrincipal()],
              actions: [`kms:*`],
              resources: [`*`],
            })
          : null,

        // Enabling lambdas from this account to use it
        props.policies.lambdas
          ? new PolicyStatement({
              principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
              actions: [`kms:GenerateDataKey`, `kms:Decrypt`],
              resources: [`*`],
              conditions: {
                StringLike: {
                  'kms:EncryptionContext:aws:lambda:FunctionArn': `arn:aws:lambda:${stack.env.region}:${stack.env.account}:function:*`,
                },
              },
            })
          : null,

        // Allow cloudwatch logs
        props.policies.cloudwatch
          ? new PolicyStatement({
              principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
              actions: [`kms:GenerateDataKey`, `kms:Decrypt`],
              resources: [`*`],
              conditions: {
                StringLike: {
                  'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${stack.env.region}:${stack.env.account}:*`,
                },
              },
            })
          : null,
      ].filter((statement) => statement != null),
    }),
    alias: config.utils.namingHelper('kms', 'key', 'alias'),
  });
  config.utils.tagsHelper(key);

  return key;
};
