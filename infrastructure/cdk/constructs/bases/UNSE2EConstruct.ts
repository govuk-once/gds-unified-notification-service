import { Duration, Stack } from 'aws-cdk-lib';
import { BuildSpec, ComputeType, LinuxBuildImage, Project, Source } from 'aws-cdk-lib/aws-codebuild';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ISecurityGroup, IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IKey, Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSS3Bucket } from 'infrastructure/cdk/constructs/bases/UNSS3BucketConstruct';
import { applyExposureTag } from 'infrastructure/cdk/utils/applyExposureTag';
import { applyPiiTag } from 'infrastructure/cdk/utils/applyPiiTag';
export interface UNSCodeBuildConstructProps {
  name: string[];
  vpc: IVpc;
  securityGroups: ISecurityGroup[];
  kms: IKey;
  flexPrivateUrl: string;
  messagesTable: Table;
}
export class UNSE2EConstruct extends Construct {
  public readonly project: Project;
  public readonly role: Role;
  public readonly sourceBucket: UNSS3Bucket;
  constructor(scope: Construct, config: EnvVars, props: UNSCodeBuildConstructProps) {
    const { constructNamingHelper, namingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    // Creates a bukcet to store the zip build
    this.sourceBucket = new UNSS3Bucket(this, config, {
      name: [...props.name, 'builds'],
      lifecycleRules: [
        {
          enabled: true,
          expiration: config.isMainEnv ? Duration.days(7) : Duration.days(1),
        },
      ],
    });
    applyExposureTag(this.sourceBucket, 'Isolated');
    applyPiiTag(this.sourceBucket, 'false');

    // Creates a role
    this.role = new Role(this, constructNamingHelper(...props.name, 'role'), {
      roleName: namingHelper('iamr', ...props.name),
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      description: `Runs the e2e suite from inside the VPC - ${config.env}`,
    });

    // Creates a project
    this.project = new Project(this, constructNamingHelper(...props.name, 'project'), {
      projectName: namingHelper(...props.name, 'project'),
      description: 'Runs the e2e test suite from within VPC',
      role: this.role,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.MEDIUM,
      },
      subnetSelection: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: props.securityGroups,
      vpc: props.vpc,
      source: Source.s3({
        bucket: this.sourceBucket.bucket,
        path: '',
      }),
      buildSpec: BuildSpec.fromSourceFilename('infrastructure/cdk/e2e-runner.buildspec.yml'),
      environmentVariables: {
        UNS_E2E_RUNNER: { value: 'true' },
        UNS_FLEX_BASE_URL: { value: props.flexPrivateUrl },
        env: { value: config.env },
      },
    });
    this.sourceBucket.bucket.grantRead(this.role);

    // Access to DynamoDB (testing injects notifications)
    props.messagesTable.grantReadWriteData(this.role);

    // Access to artifact registry
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'codeartifact:GetAuthorizationToken',
          'sts:GetServiceBearerToken',
          'codeartifact:GetRepositoryEndpoint',
          'codeartifact:Describe*',
          'codeartifact:Get*',
          'codeartifact:List*',
          'codeartifact:ReadFromRepository',
        ],
        resources: ['*'],
      })
    );
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['sts:GetServiceBearerToken'],
        conditions: {
          StringEquals: {
            'sts:AWSServiceName': 'codeartifact.amazonaws.com',
          },
        },
        resources: ['*'],
      })
    );

    const stack = Stack.of(this);
    // Access to kms
    const tlsPrefix = config.isMainEnv ? `uns-${config.env}/tls/UNS` : `uns-dev`;
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['secretsmanager:ListSecrets'],
        resources: ['*'],
      })
    );
    // Access to secrets manager
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [`arn:aws:secretsmanager:${stack.region}:${stack.account}:secret:${tlsPrefix}*`],
      })
    );
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
        resources: [`arn:aws:ssm:${config.region}:${stack.account}:parameter/${config.namespace}/*`],
      })
    );

    if (!config.isMainEnv && !config.sandbox.shared.kms) {
      throw new Error('no /shared/mtls/kmsArn in ssm');
    }
    // Access to kms
    const certificateKey = config.isMainEnv
      ? props.kms
      : Key.fromKeyArn(this, constructNamingHelper(...props.name, 'shared', 'kms'), config.sandbox.shared.kms);
    certificateKey.grantDecrypt(this.role);

    // Access to api key
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['apigateway:GET'],
        resources: [`arn:aws:apigateway:${config.region}::/apikeys`, `arn:aws:apigateway:${config.region}::/apikeys/*`],
      })
    );
    //  Access to SSM
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${config.region}:${stack.account}:parameter/infra/dns/hostedzonename`],
      })
    );

    // Access to invoke API Gateway
    this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['execute-api:Invoke'],
        resources: [`arn:aws:execute-api:${config.region}:${stack.account}:*/*`],
      })
    );
  }
}
