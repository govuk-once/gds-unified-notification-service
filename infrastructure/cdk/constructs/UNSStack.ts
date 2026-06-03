import { Stack, StackProps, Tags } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { UNSFlexResource } from 'infrastructure/cdk/constructs/UNSFlexResources';
import { UNSMTLSCommon } from 'infrastructure/cdk/constructs/UNSMTLS';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';
export class UNSStack extends Stack {
  public readonly pso: UNSPSOResource;
  public readonly flex: UNSFlexResource;
  constructor(
    scope: Construct,
    protected id: string,
    protected props: StackProps,
    protected config: EnvVars
  ) {
    super(scope, id, props);

    // Note: tags should propagate downwards automatically from there
    for (const [key, value] of Object.entries({
      ...config.defaultTags(),
    })) {
      Tags.of(scope).add(key, value, {
        // ElastiCache resources struggle with tags & reject version updates
        excludeResourceTypes: [
          `AWS::ElastiCache::User`,
          `AWS::ElastiCache::UserGroup`,
          `AWS::ElastiCache::ServerlessCache`,
        ],
      });
    }

    const common = new UNSCommon(this, config);
    const mtls = new UNSMTLSCommon(this, config, common);
    this.pso = new UNSPSOResource(this, config, { refs: common, mtlsRefs: mtls });
    this.flex = new UNSFlexResource(this, config, common);
  }
}
