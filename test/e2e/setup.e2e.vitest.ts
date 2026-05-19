import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import https from 'node:https';
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

let httpsAgent: https.Agent;
try {
  const client = new SSMClient({ region: 'eu-west-2' });

  const inputCert = { Name: '/e2e/pso/mtls/cert', WithDecryption: true };
  const inputKey = { Name: '/e2e/pso/mtls/key', WithDecryption: true };
  const cert = await client.send(new GetParameterCommand(inputCert));
  const key = await client.send(new GetParameterCommand(inputKey));

  if (!cert.Parameter || !key.Parameter) {
    throw new Error('mTLS certificates were not returned from parameter store.');
  }
  // Creates a https agent for mTLS using imported credentials
  httpsAgent = new https.Agent({
    cert: `${cert.Parameter?.Value}`,
    key: `${key.Parameter?.Value}`,
  });
} catch {
  throw new Error('mTLS certificates were not returned from parameter store.');
}

if (!httpsAgent) {
  throw new Error(
    'mTLS agent has not been configure for end to end testing, please run development:sandbox:setup to configure.'
  );
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

export const checkStatus = async (psoAPI: AxiosInstance, notificationID: string) => {
  const status = await psoAPI.get(`/status/${notificationID}`);
  expect(status.data).toEqual(
    expect.toBeOneOf([
      expect.arrayContaining([
        expect.objectContaining({ Status: NotificationStateEnum.DISPATCHED, NotificationID: notificationID }),
      ]),
      expect.arrayContaining([
        expect.objectContaining({ Status: NotificationStateEnum.VALIDATION_FAILED, NotificationID: notificationID }),
      ]),
      expect.arrayContaining([
        expect.objectContaining({ Status: NotificationStateEnum.PROCESSING_FAILED, NotificationID: notificationID }),
      ]),
      expect.arrayContaining([
        expect.objectContaining({ Status: NotificationStateEnum.DISPATCHING_FAILED, NotificationID: notificationID }),
      ]),
    ])
  );
};
