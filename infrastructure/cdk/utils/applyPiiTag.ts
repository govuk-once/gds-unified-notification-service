import { Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const applyPiiTag = (scope: Construct | undefined, pii: 'true' | 'false'): void => {
  if (scope) {
    Tags.of(scope).add('PII', pii);
  }
};
