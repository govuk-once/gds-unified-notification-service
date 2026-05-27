import { Stack, StackProps } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { UNSFlexResource } from 'infrastructure/cdk/constructs/UNSFlexResources';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';
export class UNSStack extends Stack {
  constructor(
    scope: Construct,
    protected id: string,
    protected props: StackProps,
    protected config: EnvVars
  ) {
    super(scope, id, props);

    // Note: tags should propagate downwards automatically from there
    config.utils.tagsHelper(scope);

    const common = new UNSCommon(this, config);
    new UNSPSOResource(this, config, common);
    new UNSFlexResource(this, config, common);
  }
}
