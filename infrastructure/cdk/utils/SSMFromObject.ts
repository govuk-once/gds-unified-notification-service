import { Stack } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export const SSMFromObject = <T extends Record<string, string | undefined | object>>(
  construct: Construct,
  config: EnvVars,
  values: T
) => {
  const parameters = {} as Record<keyof T, StringParameter>;
  for (const [key, value] of Object.entries(values)) {
    // Create param
    const param = new StringParameter(construct, config.utils.constructNamingHelper(`ssm`, key), {
      parameterName: `/${config.utils.namingHelper()}/${key}`,
      stringValue: typeof value == 'string' ? value : Stack.of(construct).toJsonString(value),
      simpleName: false,
    });

    // Save into dict
    parameters[key as keyof T] = param;
  }
  return parameters;
};
