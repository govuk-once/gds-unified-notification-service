import { Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const applyDataProtectionTag = (scope: Construct | undefined, exposure: 'Ephemeral'): void => {
  if (scope) {
    Tags.of(scope).add('DataProtection', exposure);
  }
};
