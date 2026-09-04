import { Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const applyPiiTag = (scope: Construct, pii: 'true' | 'false'): void => {
  Tags.of(scope).add('PII', pii);
};
