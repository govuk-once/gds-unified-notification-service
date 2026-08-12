#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from './config';
import { UNSGlobalStack } from './constructs/UNSGlobalStack';
import { UNSStack } from './constructs/UNSStack';

// Initializes a new instance of the cdk app
const app = new cdk.App();

// Global (us-east-1) stack - hosts resources that AWS requires to be deployed to
// us-east-1 regardless of the environment's primary region (e.g. the CLOUDFRONT scoped
// WAF Web ACL). Deployed into the same AWS account as the main stack.
export const globalStack = new UNSGlobalStack(
  app,
  config.utils.namingHelper('global-stack'),
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: config.global.region,
    },
    crossRegionReferences: true,
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
    crossRegionReferences: true,
  },
  config,
  globalStack
);
