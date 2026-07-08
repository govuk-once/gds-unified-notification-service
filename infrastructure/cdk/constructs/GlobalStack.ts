import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSGlobalResource } from 'infrastructure/cdk/constructs/UNSGlobalResources';

export class GlobalStack extends Stack {
  readonly global: UNSGlobalResource;

  constructor(
    protected scope: Construct,
    protected id: string,
    protected props: StackProps,
    protected config: EnvVars
  ) {
    super(scope, id, props);

    this.global = new UNSGlobalResource(this, config);

    this.applyTags(this, config);
  }

  public applyTags(scope: Construct, config: EnvVars) {
    // Apply all tags to all resources
    for (const [key, value] of Object.entries({
      ...config.defaultTags(),
    })) {
      Tags.of(scope).add(key, value);
    }

    // Also add metadata as outputs to the cloudformation stack itself for improved traceability
    const metadata = new Construct(this, `metadata`);
    Object.entries({ ...config.defaultTags() }).forEach(([key, value]) =>
      new CfnOutput(metadata, key, {
        description: `Build metadata - ${key}`,
        value: value,
      })
    )
  }
}
