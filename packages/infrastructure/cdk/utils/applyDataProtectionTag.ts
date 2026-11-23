import { applyTag } from '@infra/cdk/utils/applyTag';
import { Construct } from 'constructs';

export const applyDataProtectionTag = (scope: Construct | undefined, exposure: 'Ephemeral'): void => {
  applyTag(scope, 'DataProtection', exposure);
};
