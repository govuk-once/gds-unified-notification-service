import { Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const applyExposureTag = (
  scope: Construct | undefined,
  exposure: 'Internet-Facing' | 'Perimeter' | 'Internal' | 'Isolated'
): void => {
  if (scope) {
    Tags.of(scope).add('Exposure', exposure);
  }
};
