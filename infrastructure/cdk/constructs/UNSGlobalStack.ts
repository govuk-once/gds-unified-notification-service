import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { UNSKMSConstruct } from 'infrastructure/cdk/constructs/bases/UNSKMSConstruct';
import { UNSRoute53QueryLoggingConstruct } from 'infrastructure/cdk/constructs/bases/UNSRoute53QueryLoggingConstruct';

/**
 * Global (us-east-1) stack.
 *
 * AWS requires WAFv2 Web ACLs with `scope: CLOUDFRONT` to be created via a CloudFormation
 * stack deployed to us-east-1, regardless of which region the protected CloudFront
 * distribution/origin actually lives in. This stack exists solely to host that kind of
 * global/edge resource - it's deployed into the same per-environment AWS account as
 * `UNSStack`, just pinned to a different region.
 */
export class UNSGlobalStack extends Stack {
  constructor(
    protected scope: Construct,
    protected id: string,
    protected props: StackProps,
    protected config: EnvVars
  ) {
    super(scope, id, props);

    // Dedicated KMS key for this stack's resources - the shared key used by the main
    // stack lives in eu-west-2 and can't encrypt resources (e.g. log groups) in us-east-1.
    const kms = new UNSKMSConstruct(this, config, {
      name: ['kms', 'main', 'global'],
      policies: { root: true, lambdas: false, cloudwatch: true },
    });

    // DNS query logging
    if (config.isMainEnv) {
      new UNSRoute53QueryLoggingConstruct(this, config, {
        name: ['route53-query-logging'],
        kms: kms.key,
      });
    }

    for (const [key, value] of Object.entries(config.defaultTags())) {
      Tags.of(this).add(key, value);
    }
  }
}
