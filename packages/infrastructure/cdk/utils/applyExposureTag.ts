import { applyTag } from '@infra/cdk/utils/applyTag';
import { Construct } from 'constructs';

export const applyExposureTag = (
  scope: Construct | undefined,
  exposure: 'Internet-Facing' | 'Perimeter' | 'Internal' | 'Isolated'
): void => {
  if (scope) {
    applyTag(scope, 'Exposure', exposure);
  }
};
