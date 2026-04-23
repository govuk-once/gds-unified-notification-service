#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { config } from './config';
import { Stack } from './constructs/Stack';

// Initializes a new instance of the cdk app
const app = new cdk.App();
new Stack(
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
