import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { UNSKMSConstruct } from 'infrastructure/cdk/constructs/bases/UNSKMSConstruct';
import { managedWafRule } from 'infrastructure/cdk/utils/waf';

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
  public readonly cloudfrontWaf: wafv2.CfnWebACL;
  public readonly cloudfrontWebAclArn: string;

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

    this.cloudfrontWaf = new wafv2.CfnWebACL(this, config.utils.namingHelper('cloudfront-waf'), {
      name: config.utils.namingHelper('cloudfront-waf'),
      scope: 'CLOUDFRONT',

      defaultAction: { allow: {} },
      visibilityConfig: {
        metricName: config.utils.namingHelper('cloudfront-waf-main-metric'),
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
      },
      rules: [
        managedWafRule({
          priority: 1,
          managedRuleName: 'AWSManagedRulesCommonRuleSet',
          metricName: `${config.prefix}-cloudfront-aws-common-rule-set`,
          name: config.utils.namingHelper('cloudfront-aws-common-rule-set'),
        }),
        managedWafRule({
          priority: 10,
          managedRuleName: 'AWSManagedRulesKnownBadInputsRuleSet',
          metricName: `${config.prefix}-cloudfront-aws-bad-input-rule-metric`,
          name: config.utils.namingHelper('cloudfront-aws-bad-input-rule-metric'),
        }),
      ],
    });

    this.cloudfrontWebAclArn = this.cloudfrontWaf.attrArn;

    const wafLogGroup = new LogGroup(this, config.utils.namingHelper('cloudfront-waf-log-group'), {
      logGroupName: `aws-waf-logs-cloudfront-${config.prefix}`,
      retention: config.isMainEnv ? RetentionDays.ONE_YEAR : RetentionDays.ONE_MONTH,
      removalPolicy: config.removalPolicy,
      encryptionKey: kms.key,
    });

    new wafv2.CfnLoggingConfiguration(this, config.utils.namingHelper('cloudfront-waf-logging-configuration'), {
      resourceArn: this.cloudfrontWaf.attrArn,
      logDestinationConfigs: [wafLogGroup.logGroupArn],
    });

    for (const [key, value] of Object.entries(config.defaultTags())) {
      Tags.of(this).add(key, value);
    }
  }
}
