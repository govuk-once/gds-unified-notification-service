import { Duration } from 'aws-cdk-lib';
import { BuildSpec, ComputeType, LinuxBuildImage, Project, Source } from 'aws-cdk-lib/aws-codebuild';
import { ISecurityGroup, IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Role } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSS3Bucket } from 'infrastructure/cdk/constructs/bases/UNSS3BucketConstruct';
import { applyExposureTag } from 'infrastructure/cdk/utils/applyExposureTag';
import { applyPiiTag } from 'infrastructure/cdk/utils/applyPiiTag';

export interface UNSZaproxyConstructProps {
  name: string[];
  vpc: IVpc;
  securityGroups: ISecurityGroup[];
  role: Role;
  flexPrivateUrl: string;
}

export class UNSZaproxyConstruct extends Construct {
  public readonly project: Project;
  public readonly reportBucket: UNSS3Bucket;

  constructor(scope: Construct, config: EnvVars, props: UNSZaproxyConstructProps) {
    const { constructNamingHelper, namingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    this.reportBucket = new UNSS3Bucket(this, config, {
      name: [...props.name, 'reports'],
      lifecycleRules: [
        {
          enabled: true,
          expiration: config.isMainEnv ? Duration.days(7) : Duration.days(1),
        },
      ],
    });
    applyExposureTag(this.reportBucket, 'Isolated');
    applyPiiTag(this.reportBucket, 'false');

    this.project = new Project(this, constructNamingHelper(...props.name, 'project'), {
      projectName: namingHelper(...props.name, 'project'),
      description: 'Runs the zaproxy scan against PSO and Flex APIs from within VPC',
      role: props.role,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.MEDIUM,
        privileged: true,
      },
      subnetSelection: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      environmentVariables: {
        UNS_E2E_RUNNER: { value: 'true' },
        UNS_FLEX_BASE_URL: { value: props.flexPrivateUrl },
        UNS_REPORT_BUCKET: { value: this.reportBucket.bucket.bucketName },
        env: { value: config.env },
      },
      buildSpec: BuildSpec.fromSourceFilename('infrastructure/cdk/buildspecs/zaproxy.buildspec.yml'),
      securityGroups: props.securityGroups,
      vpc: props.vpc,
      source: Source.gitHub({
        owner: 'govuk-once',
        repo: 'gds-unified-notification-service',
        branchOrRef: 'main',
        webhook: false,
      }),
    });
    this.project.enableBatchBuilds();

    this.reportBucket.bucket.grantReadWrite(props.role);
  }
}
