import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { INotificationStatus } from '@project/lambdas/interfaces/INotificationStatus';
import axios, { AxiosError, AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import https from 'node:https';
import { test as baseTest } from 'vitest';

dotenv.config({ path: 'infrastructure/cdk/.env' });

// Suppresses unnecessary console.logs from the OTEL metrics/tracers
vi.hoisted(() => {
  process.env.POWERTOOLS_DEV = 'true';
  process.env.POWERTOOLS_METRICS_DISABLED = 'false';
});

let psoUrl: string;
let flexUrl: string;

let httpsAgent: https.Agent;

beforeAll(async () => {
  try {
    // Ensure AWS env vars are available
    if (
      process.env.AWS_ACCESS_KEY_ID == undefined ||
      process.env.AWS_SECRET_ACCESS_KEY == undefined ||
      process.env.AWS_REGION == undefined ||
      process.env.env == undefined
    ) {
      console.error(process.env.env);
      throw new Error(
        `No AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY present in env vars, please use 'eval $(gds-cli aws {accountName} -e)'`
      );
    }

    const env = process.env.env;
    if (env === 'dev') {
      psoUrl = 'pso.development.notifications.once.service.gov.uk';
      flexUrl = 'flex.development.notifications.once.service.gov.uk';
    } else {
      psoUrl = `uns-${env}-pso.development.notifications.once.service.gov.uk`;
      flexUrl = `uns-${env}-flex.development.notifications.once.service.gov.uk`;
    }

    // Retrieve mTLS certificates from parameter store for authenticating PSO and FLEX APIs
    const client = new SSMClient({ region: 'eu-west-2' });

    const inputCert = { Name: '/e2e/pso/mtls/cert', WithDecryption: true };
    const inputKey = { Name: '/e2e/pso/mtls/key', WithDecryption: true };
    const [cert, key] = await Promise.all([
      client.send(new GetParameterCommand(inputCert)),
      client.send(new GetParameterCommand(inputKey)),
    ]);

    if (!cert.Parameter || !key.Parameter) {
      throw new Error('mTLS certificates were not returned from parameter store.');
    }

    // Creates a https agent for mTLS using imported credentials
    httpsAgent = new https.Agent({
      cert: `${cert.Parameter?.Value}`,
      key: `${key.Parameter?.Value}`,
    });

    if (!httpsAgent) {
      throw new Error('HTTPS Agent failed to initialize, cannot run end to end tests.');
    }
  } catch (error) {
    console.error('Error setting up HTTPS Agent for end to end tests:', error);
    throw error;
  }
});

// Sanitizer for axios error objects to prevent config or request data from being logged
const axiosInstanceSanitizer = (instance: AxiosInstance) => {
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (axios.isAxiosError(error)) {
        delete error.config;
        delete error.request;
        if (error.response) {
          delete (error.response as Partial<AxiosError>).config;
          delete (error.response as Partial<AxiosError>).request;
        }
      }
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject(error);
    }
  );
};

// Add clients to test implementation for e2d
export const test = baseTest
  // Creates an axios client for PSO requests
  .extend('psoAPI', ({}) => {
    const instance = axios.create({
      baseURL: `https://${psoUrl}`,
      timeout: 10000,
      httpsAgent,
    });

    axiosInstanceSanitizer(instance);
    return instance;
  })
  // Creates an axios client for FLEX requests
  .extend('flexAPI', ({}) => {
    const instance = axios.create({
      baseURL: `https://${flexUrl}`,
      timeout: 10000,
      httpsAgent,
    });

    axiosInstanceSanitizer(instance);
    return instance;
  });

export const checkStatus = async (psoAPI: AxiosInstance, notificationID: string) => {
  const result = await psoAPI.get(`/status/${notificationID}`);
  console.log(`Status for notification ${notificationID}:`, result.data);
  expect(result.data).toEqual(
    expect.toBeOneOf([
      expect.arrayContaining(
        [
          NotificationStateEnum.VALIDATED_API_CALL,
          NotificationStateEnum.PROCESSING,
          // Need a way to void test notification while adapter is not VOID.
          // NotificationStateEnum.PROCESSED,
          // NotificationStateEnum.DISPATCHING,
          // NotificationStateEnum.DISPATCHED,
        ].map((Status) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          expect.objectContaining({
            Status,
            NotificationID: notificationID,
          })
        )
      ),
    ])
  );
  const status = result.data as INotificationStatus[];
  expect(status).toBeDefined();
  return status;
};
