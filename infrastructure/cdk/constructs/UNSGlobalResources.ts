import { CfnOutput } from "aws-cdk-lib";
import { Key } from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";
import { EnvVars } from "infrastructure/cdk/config";
import { UNSKMSConstruct } from "infrastructure/cdk/constructs/bases/UNSKMSConstruct";
import { UNSWaf } from "infrastructure/cdk/constructs/bases/UNSWafConstruct";

export class UNSGlobalResource extends Construct {
  public readonly psoWaf: UNSWaf;

  public readonly kms: Key;

  constructor(scope: Construct, config: EnvVars) {
    super(scope, 'global');

    //// =====================================================
    //  Shared KMS Key
    //// =====================================================
    this.kms = new UNSKMSConstruct(this, config, {
      name: ['kms', 'main'],
      policies: {
        root: true,
        lambdas: true,
        cloudwatch: true,
      },
    }).key;

    //// =====================================================
    //  Cloudfront with WAF
    //// =====================================================
    this.psoWaf = new UNSWaf(scope, config, {
      name: [`pso`],
      cloudfrontEnabled: true,
      resources: {
        kms: this.kms
      }
    });

    const wafNameOutput = new CfnOutput(this, config.utils.constructNamingHelper("Pso", "WafName"), {
      value: this.psoWaf.waf.name ?? '',
    });
    wafNameOutput.overrideLogicalId(config.utils.constructNamingHelper("Pso", "WafName"))
    const wafArnOutput = new CfnOutput(this, config.utils.constructNamingHelper("Pso", "WafArn"), {
      value: this.psoWaf.waf.attrArn,
    });
    wafArnOutput.overrideLogicalId(config.utils.constructNamingHelper("Pso", "WafArn"))
  }
}
