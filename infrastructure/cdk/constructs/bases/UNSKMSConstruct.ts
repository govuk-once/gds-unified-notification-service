import { Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export interface UNSKMSConstructProps {
  readonly name: string[];
  readonly policies: {
    readonly root: boolean;
    readonly lambdas: boolean;
    readonly cloudwatch: boolean;
  };
}

export class UNSKMSConstruct extends Construct {
  public readonly key: kms.Key;

  constructor(scope: Construct, config: EnvVars, props: UNSKMSConstructProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    const stack = Stack.of(this);
    const region = stack.env.region;
    const account = stack.env.account;

    // Instantiate the KMS Key
    this.key = new kms.Key(this, `key`, {
      enableKeyRotation: true,
      pendingWindow: Duration.days(30),
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
                    'kms:EncryptionContext:aws:lambda:FunctionArn': `arn:aws:lambda:${region}:${account}:function:*`,
                  },
                },
              })
            : null,

          // Allow cloudwatch logs
          props.policies.cloudwatch
            ? new PolicyStatement({
                principals: [new iam.ServicePrincipal(`logs.${region}.amazonaws.com`)],
                actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
                resources: [`*`],
                conditions: {
                  StringLike: {
                    'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${region}:${account}:*`,
                  },
                },
              })
            : null,
        ].filter((statement) => statement != null),
      }),
      alias: namingHelper(...props.name, 'kms', 'key', 'alias'),
    });
  }
}
