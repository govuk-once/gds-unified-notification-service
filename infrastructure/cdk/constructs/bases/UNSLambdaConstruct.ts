import { Duration, Stack } from 'aws-cdk-lib';
import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
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
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { applyCheckovSkips } from 'infrastructure/cdk/utils/applyCheckovSkip';

export interface UNSLambdaConstructProps {
  readonly serviceName: string;
  readonly name: string[];
  readonly bundlePath: string;
  readonly signingConfig: CodeSigningConfig;
  readonly environment: Record<string, string>;
  readonly runtime?: Runtime;
  readonly memory?: number;
  readonly logsRetention?: RetentionDays;
  readonly resources: {
    readonly kms: IKey;
    readonly vpc?: {
      readonly ref: IVpc;
      readonly securityGroups: ISecurityGroup[];
      readonly subnets: ISubnet[];
    };
    readonly dlq?: Queue;
  };
  readonly triggers?: {
    readonly queues?: Queue[];
  };
  readonly iam?: {
    readonly assumeableRolesArns?: string[];
    readonly sqsSend?: string[];
    readonly ssmNamespaces?: string[];
    readonly sm?: string[];
    readonly kms?: string[];
    readonly dynamodb?: Record<string, { arn: string; scan: boolean; read: boolean; write: boolean }>;
    readonly elasticache?: string[];
  };
}

export class UNSLambdaConstruct extends Construct {
  public readonly fn: NodejsFunction;
  public readonly integration: LambdaIntegration;
  public readonly role: Role;
  public readonly logGroup: LogGroup;

  public readonly config: EnvVars;
  public readonly props: UNSLambdaConstructProps;

  addPermissionsToRole(id: string, actions?: string[], resources?: string[]) {
    if (actions && actions.length > 0 && resources && resources.length > 0) {
      this.role.attachInlinePolicy(
        new Policy(this, this.config.utils.constructNamingHelper(`iam`, `policy`, `to`, id), {
          statements: [
            new PolicyStatement({
              actions: actions,
              resources: resources,
            }),
          ],
        })
      );
    }
    return this;
  }

  constructor(scope: Construct, config: EnvVars, props: UNSLambdaConstructProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));
    this.config = config;
    this.props = props;

    const stack = Stack.of(this);

    const functionName = namingHelper('lmdb', props.serviceName, ...props.name);

    // Create log group
    this.logGroup = new LogGroup(this, constructNamingHelper('lg', props.serviceName, ...props.name), {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: props.logsRetention ?? RetentionDays.ONE_MONTH,
      encryptionKey: props.resources.kms,
      removalPolicy: config.removalPolicy,
    });

    // Define role
    this.role = new Role(this, constructNamingHelper(`iamr`, props.serviceName, ...props.name), {
      roleName: namingHelper(`iamr`, props.serviceName, ...props.name),
      assumedBy: new ServicePrincipal(`lambda.amazonaws.com`, { region: stack.env.region }),
    });

    // Allow writing to CW
    this.addPermissionsToRole(`cwlogs`, ['logs:CreateLogStream', 'logs:PutLogEvents'], [this.logGroup.logGroupArn]);

    // Allow use of STS Assume Role
    this.addPermissionsToRole(`roleAssumption`, ['sts:AssumeRole'], props.iam?.assumeableRolesArns);

    // Allow use of SQS Target Queues & DLQ
    this.addPermissionsToRole(
      `queue`,
      ['sqs:SendMessage'],
      [...(props.iam?.sqsSend ?? []), ...(props.resources.dlq ? [props.resources.dlq.queueArn] : [])]
    );

    // Allow use of SSM Namespaces
    this.addPermissionsToRole(
      `ssm`,
      ['ssm:GetParameter', 'ssm:GetParametersByPath'],
      props.iam?.ssmNamespaces?.map(
        (namespace) => `arn:aws:ssm:${stack.env.region}:${stack.env.account}:parameter/${namespace}/*`
      )
    );

    // Allow use of Secrets Manager
    this.addPermissionsToRole(`sm`, ['secretsmanager:GetSecretValue'], props.iam?.sm);

    // Allow use of KMS Encryption Keys
    this.addPermissionsToRole(
      `kms`,
      ['kms:Decrypt', 'kms:GenerateDataKey'],
      [props.resources.kms.keyArn, ...(props.iam?.kms ?? [])]
    );

    // Allow use of DynamoDB Access Configurations, independent perms per table
    for (const [table, { arn, scan, read, write }] of Object.entries(props.iam?.dynamodb ?? {})) {
      this.addPermissionsToRole(
        `dynamodb-${table}`,
        [
          ...(scan ? ['dynamodb:Query', 'dynamodb:Scan'] : []),
          ...(read ? ['dynamodb:GetItem'] : []),
          ...(write
            ? ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:BatchWriteItem', 'dynamodb:DeleteItem']
            : []),
        ],
        [arn]
      );
    }

    // Allow connecting to ElastiCache
    this.addPermissionsToRole(`elasticache`, ['elasticache:Connect'], props.iam?.elasticache);

    for (const managedPolicy of [
      // Common roles
      'AWSXRayDaemonWriteAccess',
      'service-role/AWSLambdaBasicExecutionRole',
      // Allow SQS to trigger this lambda
      ...((props.triggers?.queues ?? []).length > 0 ? ['service-role/AWSLambdaSQSQueueExecutionRole'] : []),
      // Attach AWS Managed Policies dynamically based on triggers/VPC status
      ...(props.resources.vpc
        ? ['service-role/AWSLambdaVPCAccessExecutionRole', 'service-role/AWSLambdaENIManagementAccess']
        : []),
    ]) {
      this.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName(managedPolicy));
    }

    // Initialize Nodejs Lambda Function
    this.fn = new NodejsFunction(this, `fn`, {
      functionName,
      runtime: props.runtime ?? Runtime.NODEJS_22_X,
      memorySize: props.memory ?? 512,
      timeout: Duration.seconds(30),
      handler: 'index.handler',
      code: Code.fromAsset(props.bundlePath, {}),
      codeSigningConfig: props.signingConfig,
      role: this.role,
      logGroup: this.logGroup,
      adotInstrumentation: {
        layerVersion: AdotLayerVersion.fromJavaScriptSdkLayerVersion(AdotLambdaLayerJavaScriptSdkVersion.LATEST),
        execWrapper: AdotLambdaExecWrapper.REGULAR_HANDLER,
      },
      tracing: Tracing.ACTIVE,
      ...(props.resources.vpc
        ? {
            vpc: props.resources.vpc.ref,
            vpcSubnets: {
              subnets: props.resources.vpc.subnets,
            },
            securityGroups: props.resources.vpc.securityGroups,
          }
        : {}),
      environmentEncryption: props.resources.kms,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        SERVICE_NAME: `NOTIFICATIONS_${props.serviceName}`.toUpperCase().replace(`-`, `_`),
        NAMESPACE_NAME: `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace(`-`, `_`),
        PREFIX: `${config.project}-${config.env}`,
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-handler',
        OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'false',
        OTEL_SERVICE_VERSION: config.version,
        AWS_LAMBDA_NODEJS_DISABLE_CALLBACK_WARNING: `true`,
        ...(props.environment ?? {}),
      },
      ...(props.resources.dlq
        ? {
            deadLetterQueue: props.resources.dlq,
            deadLetterQueueEnabled: true,
          }
        : {}),
      events: [
        ...(props?.triggers?.queues ?? []).map(
          (q) =>
            new SqsEventSource(q, {
              batchSize: 10,
              reportBatchItemFailures: true,
            })
        ),
      ],
    });

    this.integration = new LambdaIntegration(this.fn);

    // Apply Checkov standard exclusion overrides
    applyCheckovSkips(this.fn, [
      ['CKV_AWS_117', 'Not all lambdas need to be in VPCs by design'],
      ['CKV_AWS_116', 'Lambda is not used for asyncronous processing'],
      ['CKV_AWS_115', 'Default concurrency limit is sufficient'],
    ]);
  }

  static baseFactory(serviceName: string, kind: 'http' | 'sqs' = 'http', signingConfig: CodeSigningConfig) {
    return (operationId: string) => ({
      serviceName,
      name: [operationId],
      bundlePath: `./../../dist/${serviceName}/${kind}.${operationId}`,
      signingConfig: signingConfig,
    });
  }

  static baseSQSFactory(serviceName: string, signingConfig: CodeSigningConfig) {
    return UNSLambdaConstruct.baseFactory(serviceName, 'sqs', signingConfig);
  }
  static baseHTTPFactory(serviceName: string, signingConfig: CodeSigningConfig) {
    return UNSLambdaConstruct.baseFactory(serviceName, 'http', signingConfig);
  }
}
