import { Tags } from 'aws-cdk-lib';
import { Construct } from 'node_modules/constructs/lib/construct';

export const applyTag = (scope: Construct | undefined, key: string, value: string) => {
  // Certain resource types do not consistently respond when updated regularly with new tags
  const problematicResourceTypes = [
    `AWS::ElastiCache::User`,
    `AWS::ElastiCache::UserGroup`,
    `AWS::ElastiCache::ServerlessCache`,
  ];
  if (scope) {
    Tags.of(scope).add(key, value, {
      excludeResourceTypes: ['PII', 'Exposure'].includes(key) ? [] : problematicResourceTypes,
    });
  }
};
