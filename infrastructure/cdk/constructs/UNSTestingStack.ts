import { Stack, StackProps } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSE2EConstruct } from 'infrastructure/cdk/constructs/bases/UNSE2EConstruct';
import { UNSZaproxyConstruct } from 'infrastructure/cdk/constructs/bases/UNSZaproxyConstruct';

export interface UNSTestingContract {
  readonly vpc: IVpc;
  readonly securityGroups: ISecurityGroup[];
  readonly kms: IKey;
  readonly flexPrivateUrl: string;
  readonly messagesTable: Table;
}

export class UNSTestingStack extends Stack {
  public readonly e2eRunner: UNSE2EConstruct;
  public readonly zaproxy: UNSZaproxyConstruct;
  constructor(scope: Construct, id: string, props: StackProps, config: EnvVars, contract: UNSTestingContract) {
    super(scope, id, props);

    this.e2eRunner = new UNSE2EConstruct(this, config, {
      ...contract,
      name: ['e2e', 'runner'],
    });

    this.zaproxy = new UNSZaproxyConstruct(this, config, {
      name: ['zaproxy'],
      vpc: contract.vpc,
      securityGroups: contract.securityGroups,
      role: this.e2eRunner.role,
      flexPrivateUrl: contract.flexPrivateUrl,
    });
  }
}
