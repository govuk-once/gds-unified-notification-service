import { applyTag } from '@infra/cdk/utils/applyTag';
import { Construct } from 'constructs';

export const applyPiiTag = (scope: Construct | undefined, pii: 'true' | 'false' | 'unknown'): void => {
  applyTag(scope, 'PII', pii);
};
