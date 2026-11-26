import { EnvVars } from '@infra/cdk/config';
import { UNSResourceContract } from '@infra/cdk/constructs/UNSResourceContract';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class UNSAdminPortalStack extends Stack {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(scope: Construct, id: string, props: StackProps, config: EnvVars, resources: UNSResourceContract) {
    super(scope, id, props);
  }
}
