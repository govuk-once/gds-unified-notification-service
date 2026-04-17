import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export class Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps, config: Partial<EnvVars> = {}) {
    super(scope, id, props);
  }
}
