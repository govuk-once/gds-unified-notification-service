import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { CfnLoggingConfiguration, CfnWebACL, CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export interface UNSWafProps {
  readonly name: string[];

  readonly cloudfrontEnabled: boolean;

  readonly resources: {
    readonly kms: IKey;
  };

  readonly restApi?: RestApi;
}

export class UNSWaf extends Construct {
  public readonly props: UNSWafProps;
  public readonly waf: CfnWebACL;

  managedRule(ruleProps: { priority: number; name: string; managedRuleName: string; metricName: string }) {
    return {
      name: ruleProps.name,
      priority: ruleProps.priority,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: ruleProps.managedRuleName,
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: ruleProps.metricName,
        sampledRequestsEnabled: true,
      },
    };
  }

  constructWAF(config: EnvVars) {
    const scope = this.props.cloudfrontEnabled ? 'CLOUDFRONT' : 'REGIONAL';

    // WAFv2 Protection configuration builder
    const webAcl = new CfnWebACL(
      this,
      config.utils.namingHelper(...this.props.name, this.props.cloudfrontEnabled ? 'cloudfront-waf' : 'waf'),
      {
        name: config.utils.namingHelper(...this.props.name, 'waf'),
        scope: scope,
        defaultAction: { allow: {} },
        visibilityConfig: {
          metricName: config.utils.namingHelper(...this.props.name, 'main-metric'),
          cloudWatchMetricsEnabled: true,
          sampledRequestsEnabled: true,
        },
        rules: [
          this.managedRule({
            priority: 1,
            managedRuleName: 'AWSManagedRulesCommonRuleSet',
            metricName: `${config.prefix}-aws-common-rule-set`,
            name: config.utils.namingHelper(...this.props.name, 'aws-common-rule-set'),
          }),
          this.managedRule({
            priority: 10,
            managedRuleName: 'AWSManagedRulesKnownBadInputsRuleSet',
            metricName: `${config.prefix}-aws-bad-input-rule-metric`,
            name: config.utils.namingHelper(...this.props.name, 'aws-bad-input-rule-metric'),
          }),
          // This rule while sensible rejects E2E tests from GH Actions
          // this.managedRule({
          //   priority: 100,
          //   managedRuleName: 'AWSManagedRulesAnonymousIpList',
          //   metricName: `${config.prefix}-anonymous-ip-list-rule-metric`,
          //   name: config.utils.namingHelper(...props.name, 'anonymous-ip-list-rule-metric'),
          // }),
        ],
      }
    );

    if (scope === 'REGIONAL') {
      if (!this.props.restApi) {
        throw new Error('For a regional WAF, the rest api must be provided.');
      }
      // Associate WAF with API Stage Deployment
      new CfnWebACLAssociation(this, config.utils.namingHelper(...this.props.name, 'waf-association'), {
        resourceArn: this.props.restApi.deploymentStage.stageArn,
        webAclArn: webAcl.attrArn,
      });

      const wafLogGroup = new LogGroup(this, config.utils.namingHelper(...this.props.name, 'waf-log-group'), {
        logGroupName: `aws-waf-logs-api-gateway-${config.utils.namingHelper(...this.props.name)}`,
        retention: RetentionDays.ONE_YEAR,
        removalPolicy: config.removalPolicy,
        encryptionKey: this.props.resources.kms,
      });

      new CfnLoggingConfiguration(this, config.utils.namingHelper(...this.props.name, 'waf-logging-configuration'), {
        resourceArn: webAcl.attrArn,
        logDestinationConfigs: [wafLogGroup.logGroupArn],
      });
    }

    return webAcl;
  }

  constructor(scope: Construct, config: EnvVars, props: UNSWafProps) {
    const { constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(`waf`, ...props.name));
    this.props = props;

    this.waf = this.constructWAF(config);
  }
}
