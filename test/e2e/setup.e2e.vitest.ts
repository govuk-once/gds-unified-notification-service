import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SSMClient } from '@aws-sdk/client-ssm';
import { STSClient } from '@aws-sdk/client-sts';
import axios from 'axios';
import { S3Client } from 'bun';
import dotenv from 'dotenv';
import fs from 'fs';
import https from 'https';
import { test as baseTest } from 'vitest';

dotenv.config();

// Suppresses unnecessary console.logs from the OTEL metrics/tracers
vi.hoisted(() => {
  process.env.POWERTOOLS_DEV = 'true';
  process.env.POWERTOOLS_METRICS_DISABLED = 'false';
});

const psoUrl = process.env.AWS_PSO_CUSTOM_DOMAIN_NAME;
const flexUrl = process.env.AWS_FLEX_CUSTOM_DOMAIN_NAME;
if (psoUrl == undefined || flexUrl == undefined) {
  throw new Error(
    'Domain names are not setup for end to end testing, please run development:sandbox:setup to configure.'
  );
}

let httpsAgent: https.Agent;
try {
  // Creates a https agent for mTLS using imported credentials
  httpsAgent = new https.Agent({
    cert: fs.readFileSync('./test/e2e/config/cert-file.crt'),
    key: fs.readFileSync('./test/e2e/config/cert-file.pem'),
  });
} catch {
  throw new Error(
    'mTLS certificates are not setup for end to end testing, please run development:sandbox:setup to configure.'
  );
}

if (!httpsAgent) {
  throw new Error(
    'mTLS agent has not been configure for end to end testing, please run development:sandbox:setup to configure.'
  );
}

// Ensure AWS env vars are available
if (
  process.env.AWS_ACCESS_KEY_ID == undefined ||
  process.env.AWS_SECRET_ACCESS_KEY == undefined ||
  process.env.AWS_REGION == undefined
) {
  console.log(
    `No AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY present in env vars, please use 'eval $(gds-cli aws {accountName} -e)'`
  );
  process.exit(1);
}

// Add clients to test implementation for e2d
export const test = baseTest
  // Creates an axios client for PSO requests
  .extend('psoAPI', ({}) => {
    const instance = axios.create({
      baseURL: `https://${psoUrl}`,
      timeout: 20000,
      httpsAgent,
    });
    return instance;
  })
  // Creates an axios client for FLEX requests
  .extend('flexAPI', ({}) => {
    const instance = axios.create({
      baseURL: `https://${flexUrl}`,
      timeout: 20000,
      httpsAgent,
    });
    return instance;
  });
