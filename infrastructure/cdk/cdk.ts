#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { config } from './config';
import { UNSStack } from './constructs/UNSStack';

// Initializes a new instance of the cdk app
const app = new cdk.App();
new UNSStack(
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
