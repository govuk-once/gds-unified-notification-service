import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as customResources from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export interface UNSCustomResourceConstructProps {
  name: string[];
  tsFn: string;
  modules: string[];
}

export class UNSCustomResourceConstruct<
  InputType extends {
    [key: string]: unknown;
  },
> extends Construct {
  public readonly props: UNSCustomResourceConstructProps;
  public readonly config: EnvVars;
  public readonly provider: customResources.Provider;
  public readonly fn: nodejs.NodejsFunction;
  constructor(scope: Construct, config: EnvVars, props: UNSCustomResourceConstructProps) {
    super(scope, config.utils.constructNamingHelper('cdk', ...props.name));
    this.props = props;
    this.config = config;
    const { constructNamingHelper, namingHelper } = config.utils;

    // Create log group for custom lambda resource generator
    const functionName = namingHelper('cdk-construct-lambda', ...props.name);
    const loggroup = new LogGroup(this, `logs`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: config.removalPolicy,
    });

    // Build the Custom Resource Lambda function to execute Key/CSR generation
    this.fn = new nodejs.NodejsFunction(this, 'cdk-constructor-lambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: `./customResourceFns/${props.tsFn}.ts`,
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      logGroup: loggroup,
      bundling: {
        nodeModules: props.modules,
      },
    });
    loggroup.grantRead(this.fn);
    loggroup.grantWrite(this.fn);

    // Define the Custom Resource Provider lifecycle
    this.provider = new customResources.Provider(this, constructNamingHelper('provider'), {
      onEventHandler: this.fn,
    });
  }

  public use(caller: Construct, props: InputType) {
    return new cdk.CustomResource(caller, this.config.utils.constructNamingHelper(`cdk`, ...this.props.name), {
      serviceToken: this.provider.serviceToken,
      properties: props,
    });
  }
}
