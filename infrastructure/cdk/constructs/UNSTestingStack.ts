import { Stack, StackProps } from 'aws-cdk-lib';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSE2EConstruct } from 'infrastructure/cdk/constructs/bases/UNSE2EConstruct';

export interface UNSTestingContract {
  readonly vpc: IVpc;
  readonly securityGroups: ISecurityGroup[];
}

export class UNSTestingStack extends Stack {
  public readonly e2eRunner: UNSE2EConstruct;
  constructor(scope: Construct, id: string, props: StackProps, config: EnvVars, contract: UNSTestingContract) {
    super(scope, id, props);

    this.e2eRunner = new UNSE2EConstruct(this, config, {
      ...contract,
      name: ['e2e', 'runner'],
    });
  }
}
