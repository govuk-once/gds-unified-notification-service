import { CfnResource } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

export function applyCheckovSkips(construct: IConstruct, skips: [string, string][]) {
  const resource = construct instanceof CfnResource ? construct : (construct.node.defaultChild as CfnResource);
  if (resource?.getMetadata == undefined) {
    return;
  }
  const checkovMetadata = resource.getMetadata('checkov') as undefined | { skip?: [string, string][] };
  const previousSkips = checkovMetadata?.skip ?? [];

  resource.addMetadata('checkov', { skip: [...previousSkips, ...skips.map(([id, comment]) => ({ id, comment }))] });
  return construct;
}

export function applyCheckovSkipsRecursive(construct: IConstruct, skips: [string, string][]) {
  // Apply skips directly
  applyCheckovSkips(construct, skips);

  // Apply skips to descendants
  for (const child of construct.node.children) {
    applyCheckovSkipsRecursive(child, skips);
  }
}

export function findResource(construct: IConstruct, predicate: (c: IConstruct) => boolean): IConstruct | null {
  if (predicate(construct)) {
    return construct;
  }
  if (construct.node.children) {
    for (const child of construct.node.children) {
      if (predicate(child)) {
        return child;
      }
      const result = findResource(child, predicate);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

export function applyCheckovSkipsS3Bucket(construct: IConstruct) {
  return applyCheckovSkipsRecursive(construct, [
    ['CKV_AWS_18', 'Access logs may not be necessary for this bucket - as it should covered by cloudtrail'],

    [
      'CKV_AWS_117',
      '"Ensure that AWS Lambda function is configured inside a VPC" - Not all lambdas need to be in VPCs by design',
    ],
    [
      'CKV_AWS_116',
      '"Ensure that AWS Lambda function is configured for a Dead Letter Queue(DLQ)" - Lambda is not used for asynchronous processing',
    ],
    [
      'CKV_AWS_115',
      '"Ensure that AWS Lambda function is configured for function-level concurrent execution limit" - Default concurrency limit is sufficient',
    ],
    [
      'CKV_AWS_173',
      '"Check encryption settings for Lambda environment variable" - No environment variables used - encryption is not needed',
    ],
  ]);
}
