#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from './config';
import { UNSStack } from './constructs/UNSStack';
import { GlobalStack } from 'infrastructure/cdk/constructs/GlobalStack';

// Initializes a new instance of the cdk app
const app = new cdk.App();

export const globalStack = new GlobalStack(
  app,
  config.utils.namingHelper('global-stack'),
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'us-east-1',
    },
  },
  config
);

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

stack.addDependency(globalStack);
