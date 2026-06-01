import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as s3deployment from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface UNSS3FileUploadConstructProps {
  readonly destinationBucket: IBucket;
  readonly path: string;
  readonly contents: string;
}

export class UNSS3FileUploadConstruct extends Construct {
  public readonly deployment: s3deployment.BucketDeployment;

  constructor(scope: Construct, id: string, props: UNSS3FileUploadConstructProps) {
    super(scope, id);

    // Instantiate the BucketDeployment using the passed inline string data
    this.deployment = new s3deployment.BucketDeployment(this, 'DataDeployment', {
      sources: [s3deployment.Source.data(props.path, props.contents)],
      destinationBucket: props.destinationBucket,
      prune: false, // Ensure we don't delete existing bucket objects
    });
  }
}
