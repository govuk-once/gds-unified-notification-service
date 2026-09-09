import { ComputeType, LinuxBuildImage, Project, Source } from 'aws-cdk-lib/aws-codebuild';
import { ISecurityGroup, IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSS3Bucket } from 'infrastructure/cdk/constructs/bases/UNSS3BucketConstruct';
export interface UNSCodeBuildConstructProps {
  name: string[];
  vpc: IVpc;
  securityGroups: ISecurityGroup[];
}
export class UNSE2EConstruct extends Construct {
  public readonly project: Project;
  public readonly sourceBucket: UNSS3Bucket;
  constructor(scope: Construct, config: EnvVars, props: UNSCodeBuildConstructProps) {
    const { constructNamingHelper, namingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    // Creates a bukcet to store the zip build
    this.sourceBucket = new UNSS3Bucket(this, config, {
      name: [...props.name, 'builds'],
    });

    // Creates a project
    this.project = new Project(this, constructNamingHelper(...props.name, 'project'), {
      projectName: namingHelper(...props.name, 'project'),
      description: 'Runs the e2e test suite against the private flex-private API Gateway from inside the VPC',
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
        path: 'overwritten-at-runtime',
      }),
    });
    this.sourceBucket.bucket.grantRead(this.project);
  }
}
