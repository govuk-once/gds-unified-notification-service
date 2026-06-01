import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as s3deployment from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export const uploadToS3 = (
  parent: Construct,
  id: string,
  destinationBucket: IBucket,
  path: string,
  contents: string
) => {
  return new s3deployment.BucketDeployment(parent, id, {
    sources: [
      // Points to a local directory containing the file(s) you want to upload
      s3deployment.Source.data(path, contents),
    ],
    destinationBucket,

    // Ensure we dont delete anything else
    prune: false,
  });
};
