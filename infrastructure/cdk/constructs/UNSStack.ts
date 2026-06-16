import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { UNSFlexResource } from 'infrastructure/cdk/constructs/UNSFlexResources';
import { UNSMTLSCommon } from 'infrastructure/cdk/constructs/UNSMTLS';
import { UNSOrganisationsCommon } from 'infrastructure/cdk/constructs/UNSOrganisations';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';

export class UNSStack extends Stack {
  public readonly pso: UNSPSOResource;
  public readonly flex: UNSFlexResource;

  public readonly metadata: Construct;
  public readonly metadataEntries: CfnOutput[];
  constructor(
    scope: Construct,
    protected id: string,
    protected props: StackProps,
    protected config: EnvVars
  ) {
    super(scope, id, props);

    const common = new UNSCommon(this, config);
    const mtls = new UNSMTLSCommon(this, config, common);
    const organisations = new UNSOrganisationsCommon(this, config, common);
    this.pso = new UNSPSOResource(this, config, {
      refs: common,
      mtls: {
        truststorePath: mtls.truststorePath,
        dependencies: [mtls.truststoreUpload],
        // Main environments generate their own CA cert, dev environments pull it via exported values
        ...(config.isMainEnv
          ? {
              revocationTableArn: mtls.revocationTable!.table.tableArn,
              revocationTableAttributes: mtls.revocationTable!.attributes,
            }
          : {
              revocationTableArn: config.sandbox.shared.revocationTable!,
              revocationTableAttributes: config.sandbox.shared.revocationAttributes,
            }),
      },
    });
    this.flex = new UNSFlexResource(this, config, { refs: common, organisationsRef: organisations });

    // Note: tags should propagate downwards automatically from there
    // Some resources i.e. Elasticache fail when those tags are updated
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

    // Also add metadata as outputs for traceability
    this.metadata = new Construct(this, `metadata`);
    this.metadataEntries = Object.entries({ ...config.defaultTags(), version: config.version }).map(
      ([key, value]) =>
        new CfnOutput(this.metadata, key, {
          description: `Build metadata - ${key}`,
          value: value,
        })
    );
  }
}
