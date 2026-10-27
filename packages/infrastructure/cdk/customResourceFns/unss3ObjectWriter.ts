import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

export type unss3ObjectWriterProps = {
  bucket: string;
  key: string;
  source: string;
};

const client = new S3Client({});
export const handler = async (event: CloudFormationCustomResourceEvent<unss3ObjectWriterProps>) => {
  if (event.RequestType == 'Delete') {
    console.log(`Deleting file`);
    await client.send(
      new DeleteObjectCommand({
        Bucket: event.ResourceProperties.bucket,
        Key: event.ResourceProperties.key,
      })
    );
    console.log(`Delete completed`);
  } else {
    console.log(`Updating file`);
    await client.send(
      new PutObjectCommand({
        Bucket: event.ResourceProperties.bucket,
        Key: event.ResourceProperties.key,
        Body: event.ResourceProperties.source,
      })
    );
    console.log(`Update completed`);
  }
  // Return the generated PEM structural block back up
  return {
    PhysicalResourceId: event.LogicalResourceId,
    Data: {},
  };
};
