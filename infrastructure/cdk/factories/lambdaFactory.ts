import { ISecurityGroup, ISubnet, IVpc } from 'aws-cdk-lib/aws-ec2';
import { ManagedPolicy, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import {
  AdotLambdaExecWrapper,
  AdotLambdaLayerJavaScriptSdkVersion,
  AdotLayerVersion,
  Code,
  CodeSigningConfig,
  Runtime,
  Tracing,
} from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { RemovalPolicy, Stack } from 'aws-cdk-lib/core';

import { EnvVars } from 'infrastructure/cdk/config';

export const lambdaFactory = (
  stack: Stack,
  config: EnvVars,
  props: {
    serviceName: string;
    name: string[];
    bundlePath: string;
    signingConfig: CodeSigningConfig;
    environment: Record<string, string>;
    runtime?: Runtime;
    memory?: number;
    logsRetention?: RetentionDays;
    resources: {
      kms: IKey;

      vpc?: {
        ref: IVpc;
        securityGroups: ISecurityGroup[];
        subnets: ISubnet[];
      };

      dlq?: Queue;
    };

    triggers?: {
      queues?: Queue[];
    };

    iam?: {
      assumeableRolesArns?: string[];
      sqsSend?: string[];
      ssmNamespaces?: string[];
      sm?: string[];
      kms?: string[];
      dynamodb?: Record<string, { arn: string; scan: boolean; read: boolean; write: boolean }>;
    };
  }
) => {
  const functionName = config.utils.namingHelper('lmdb', props.serviceName, ...props.name);

  const logGroup = new LogGroup(stack, config.utils.namingHelper('lg', props.serviceName, ...props.name), {
    logGroupName: `/aws/lambda/${functionName}`,
    retention: props.logsRetention ?? RetentionDays.ONE_MONTH,
    encryptionKey: props.resources.kms,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  // Create a role that can be assumed by our lambda
  const role = new Role(stack, config.utils.namingHelper(`iamr`, props.serviceName, ...props.name), {
    assumedBy: new ServicePrincipal(`lambda.amazonaws.com`, { region: stack.env.region }),
  });

  // Allow that role to write to log group
  role.attachInlinePolicy(
    new Policy(stack, config.utils.namingHelper(`iamr`, props.serviceName, ...props.name, `to-cwlogs`), {
      statements: [
        new PolicyStatement({
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: [logGroup.logGroupArn],
        }),
      ],
    })
  );

  // Allow this lambda to assume specified roles
  if (props.iam?.assumeableRolesArns && props.iam.assumeableRolesArns.length > 0) {
    role.attachInlinePolicy(
      new Policy(stack, config.utils.namingHelper(`iamr`, props.serviceName, ...props.name, `to-role-assumption`), {
        statements: [
          new PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: props.iam.assumeableRolesArns,
          }),
        ],
      })
    );
  }

  // Allow this lambda to push messages to specific queues
  if (props.iam?.sqsSend && props.iam.sqsSend.length > 0) {
    role.attachInlinePolicy(
      new Policy(stack, config.utils.namingHelper(`iamr`, props.serviceName, ...props.name, `to-queue`), {
        statements: [
          new PolicyStatement({
            actions: ['sts:SendMessage'],
            resources: props.iam.sqsSend,
          }),
        ],
      })
    );
  }

  // Allow this lambda to read specific ssm values
  if (props.iam?.ssmNamespaces && props.iam.ssmNamespaces.length > 0) {
    role.attachInlinePolicy(
      new Policy(stack, config.utils.namingHelper(`iamr`, props.serviceName, ...props.name, `to-ssm`), {
        statements: [
          new PolicyStatement({
            actions: ['ssm:GetParameter', 'ssm:GetParametersByPath'],
            resources: props.iam.ssmNamespaces.map(
              (namespace) => `arn:aws:ssm:${stack.env.region}:${stack.env.account}:parameter/${namespace}/*`
            ),
          }),
        ],
      })
    );
  }

  // Allow this lambda to read specific sm values
  if (props.iam?.sm && props.iam.sm.length > 0) {
    role.attachInlinePolicy(
      new Policy(stack, config.utils.namingHelper(`iamr`, props.serviceName, ...props.name, `to-ss`), {
        statements: [
          new PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: props.iam.sm,
          }),
        ],
      })
    );
  }

  // Allow this lambda to use kms
  if (props.resources.kms) {
    role.attachInlinePolicy(
      new Policy(stack, config.utils.namingHelper(`iamr`, props.serviceName, ...props.name, `to-kms`), {
        statements: [
          new PolicyStatement({
            actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
            resources: [props.resources.kms.keyArn, ...(props.iam?.kms ?? [])],
          }),
        ],
      })
    );
  }

  // Allow it to use DynamoDB
  for (const [table, { arn, scan, read, write }] of Object.entries(props.iam?.dynamodb ?? {})) {
    role.attachInlinePolicy(
      new Policy(stack, config.utils.namingHelper(`iamr`, props.serviceName, ...props.name, `to-dynamodb`, table), {
        statements: [
          new PolicyStatement({
            actions: [
              ...(scan ? ['dynamodb:Query', 'dynamodb:Scan'] : []),
              ...(read ? ['dynamodb:GetItem'] : []),
              ...(write
                ? ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:BatchWriteItem', 'dynamodb:DeleteItem']
                : []),
            ],
            resources: [arn],
          }),
        ],
      })
    );
  }

  // Allow the role to use other policies
  for (const managedPolicy of [
    // Always - Cloudwatch and XRay log writing
    'AWSXRayDaemonWriteAccess',
    'service-role/AWSLambdaBasicExecutionRole',

    // If there's a trigger queue provided - Allow lambdas to consume messages
    ...((props.triggers?.queues ?? []).length > 0 ? ['service-role/AWSLambdaSQSQueueExecutionRole'] : []),

    // Allow lambdas to connect to VPCs - if there's subnet ids provided
    ...(props.resources.vpc
      ? ['service-role/AWSLambdaVPCAccessExecutionRole', 'service-role/AWSLambdaENIManagementAccess']
      : []),
  ]) {
    role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName(managedPolicy));
  }

  const fn = new NodejsFunction(stack, functionName, {
    // Metadata
    functionName,

    // Instance config
    runtime: props.runtime ?? Runtime.NODEJS_22_X,
    memorySize: props.memory ?? 512,

    // Code signing
    handler: 'index.handler',
    code: Code.fromAsset(props.bundlePath, {}),
    codeSigningConfig: props.signingConfig,

    // IAM
    role,

    // Logging / Xray / OTEL
    logGroup,
    adotInstrumentation: {
      layerVersion: AdotLayerVersion.fromJavaScriptSdkLayerVersion(AdotLambdaLayerJavaScriptSdkVersion.LATEST),
      execWrapper: AdotLambdaExecWrapper.REGULAR_HANDLER,
    },
    tracing: Tracing.ACTIVE,

    // VPC - Only if VPC config has been provider
    ...(props.resources.vpc
      ? {
          vpc: props.resources.vpc.ref,
          vpcSubnets: {
            subnets: props.resources.vpc.subnets,
          },
          securityGroups: props.resources.vpc.securityGroups,
        }
      : {}),

    // Config
    environment: {
      NODE_OPTIONS: '--enable-source-maps',
      SERVICE_NAME: `NOTIFICATIONS_${props.serviceName}`.toUpperCase().replace(`-`, `_`),
      NAMESPACE_NAME: `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace(`-`, `_`),
      PREFIX: config.env,

      // Open Telemetry instrumentation vars
      AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-handler',
      OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'false',

      // Flags
      AWS_LAMBDA_NODEJS_DISABLE_CALLBACK_WARNING: `true`,
      ...(props.environment ?? {}),
    },

    // DLQ
    ...(props.resources.dlq
      ? {
          deadLetterQueue: props.resources.dlq,
          deadLetterQueueEnabled: true,
        }
      : {}),

    // Triggers
    events: [...(props?.triggers?.queues ?? []).map((q) => new SqsEventSource(q))],
  });

  return {
    fn,
    role,
    logGroup,
  };
};
