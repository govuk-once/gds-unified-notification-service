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

  constructor(
    protected scope: Construct,
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

    this.applyTags(this, config);
  }

  public applyTags(scope: Construct, config: EnvVars) {
    // Certain resource types do not consistently respond when updated regularly with new tags
    // (i.e. code version)
    const problematicResourceTypes = [
      `AWS::ElastiCache::User`,
      `AWS::ElastiCache::UserGroup`,
      `AWS::ElastiCache::ServerlessCache`,
    ];
    // Apply all tags to all rescources - except the problematic ones
    for (const [key, value] of Object.entries({
      ...config.defaultTags(),
    })) {
      Tags.of(scope).add(key, value, { excludeResourceTypes: problematicResourceTypes });
    }

    // Also add metadata as outputs to the cloudformation stack itself for improved traceability
    const metadata = new Construct(this, `metadata`);
    Object.entries({ ...config.defaultTags() }).map(
      ([key, value]) =>
        new CfnOutput(metadata, key, {
          description: `Build metadata - ${key}`,
          value: value,
        })
    );
  }
}
