#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from './config';
import { UNSAlarmsStack } from './constructs/UNSAlarmsStack';
import { UNSStack } from './constructs/UNSStack';

// Initializes a new instance of the cdk app
const app = new cdk.App();
export const stack = new UNSStack(
  app,
  config.utils.namingHelper('stack'),
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  },
  config
);

export const alarmsStack = new UNSAlarmsStack(
  app,
  config.utils.namingHelper('alarms-stack'),
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  },
  config,
  stack.resourceNames()
);

alarmsStack.addDependency(stack);
