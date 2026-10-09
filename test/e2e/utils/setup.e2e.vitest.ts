import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { FetchErrorResponse, FetchService } from '@common/services/FetchService';
import { FetchSigV4Service } from '@common/services/FetchSigV4Service';
import { CampaignStatus } from '@project/lambdas';
import { INotificationStatus } from '@project/lambdas/interfaces/INotificationStatus';
import { domainName, fetchApiKeys, fetchMtlsCertificates } from '@shared/credentials';
import { Agent } from 'undici';
import { test as baseTest } from 'vitest';
import { config } from '../../../infrastructure/cdk/config';

// Suppresses unnecessary console.logs from the OTEL metrics/tracers
vi.hoisted(() => {
  process.env.POWERTOOLS_DEV = 'true';
  process.env.POWERTOOLS_METRICS_DISABLED = 'false';
});

const usePrivateGateway = config.isE2ERunner;
const psoUrl = domainName(`pso`);
const flexUrl = domainName(`flex`, usePrivateGateway);
const flexKeyMarker = usePrivateGateway ? 'private' : 'e2e';

let flexApiKey = '';
let psoApiKey = '';

let httpsAgent: Agent;

const prepareBeforeAll = async () => {
  try {
    if (!psoUrl || !flexUrl) {
      throw new Error(
        'Domain names are not setup for end to end testing, please run development:sandbox:setup to configure.'
      );
    }

    // Ensure AWS env vars are available (ignore for codebuild)
    const runningCodeBuild = process.env.CODEBUILD_BUILD_ID !== undefined;
    if (
      !runningCodeBuild &&
      (process.env.AWS_ACCESS_KEY_ID == undefined ||
        process.env.AWS_SECRET_ACCESS_KEY == undefined ||
        process.env.AWS_REGION == undefined)
    ) {
      throw new Error(
        `No AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY present in env vars, please use 'eval $(gds-cli aws {accountName} -e)'`
      );
    }

    process.env.PREFIX = `uns-${config.env}`;

    // Retrieve mTLS certificates from Secrets Manager
    const { crt, key } = await fetchMtlsCertificates();

    // Fetch API Keys from usage plans on the fly
    const apiKeys = await fetchApiKeys(flexKeyMarker);
    psoApiKey = apiKeys.psoApiKey;
    flexApiKey = apiKeys.flexApiKey;

    // Creates a https agent for mTLS using imported credentials
    httpsAgent = new Agent({
      connect: {
        cert: crt,
        key: key,
        rejectUnauthorized: false,
      },
    });

    if (!httpsAgent) {
      throw new Error('HTTPS Agent failed to initialize, cannot run end to end tests.');
    }
  } catch (error) {
    console.error('Error setting up HTTPS Agent for end to end tests:', error);
    throw error;
  }
};

beforeAll(async () => await prepareBeforeAll());

// Add clients to test implementation for e2d
export const testFixtures = () => {
  return {
    psoAPI: new FetchService({
      baseUrl: `https://${psoUrl}`,
      defaultHeaders: {
        'x-api-key': psoApiKey,
      },
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: httpsAgent as unknown as never,
      },
    }),
    psoAPIWithoutAPIKey: new FetchService({
      baseUrl: `https://${psoUrl}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: httpsAgent as unknown as never,
      },
    }),
    psoAPIWithoutMTLSCert: new FetchService({
      baseUrl: `https://${psoUrl}`,
      defaultHeaders: {
        'x-api-key': psoApiKey,
      },
      defaultTimeout: 60000,
    }),
    psoAPIUsingInsecureProtocol: new FetchService({
      baseUrl: `http://${psoUrl}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
    }),
    flexAPI: new FetchSigV4Service({
      baseUrl: `https://${flexUrl}`,
      credentials: { region: config.region },
      defaultHeaders: {
        'x-api-key': flexApiKey,
      },
    }),
    flexAPIWithoutAPIKey: new FetchSigV4Service({
      baseUrl: `https://${flexUrl}`,
      credentials: { region: config.region },
      defaultHeaders: {},
    }),
    flexAPIUsingInsecureProtocol: new FetchService({
      baseUrl: `http://${flexUrl}`,
      defaultTimeout: 60000,
      defaultHeaders: {
        'x-api-key': psoApiKey,
      },
      fetchOptions: {
        dispatcher: httpsAgent as unknown as never,
      },
    }),
  };
};
export const test = baseTest
  // Creates an axios client for PSO requests
  .extend('psoAPI', ({}) => {
    return testFixtures().psoAPI;
  })
  .extend('psoAPIWithoutAPIKey', ({}) => {
    return testFixtures().psoAPIWithoutAPIKey;
  })
  .extend('psoAPIWithoutMTLSCert', ({}) => {
    return testFixtures().psoAPIWithoutMTLSCert;
  })
  .extend('psoAPIUsingInsecureProtocol', ({}) => {
    return testFixtures().psoAPIUsingInsecureProtocol;
  })
  .extend('flexAPI', ({}) => {
    return testFixtures().flexAPI;
  })
  .extend('flexAPIWithoutAPIKey', ({}) => {
    return testFixtures().flexAPIWithoutAPIKey;
  })
  .extend('flexAPIUsingInsecureProtocol', ({}) => {
    return testFixtures().flexAPIUsingInsecureProtocol;
  })
  .extend(`mockNotificationID`, () => ({
    valid: 'd4e04ac4-5696-45b7-8e8c-0060883a84f5',
    notFound: 'unknown-notification-id',
  }))
  .extend('pushID', ({}) => 'abc123')
  .extend(
    'validPushID',
    ({}) =>
      ({
        dev: `7s1EVFj6JYNF4JA_ClmeArf06BdsABRhJhDKgPNuY0M`,
      })[config.env] ?? 'cde456'
  );

export const checkStatus = async (psoAPI: FetchService, notificationID: string) => {
  const result = await psoAPI.get({ path: `/status/${notificationID}` });
  expect(result.body).toEqual(
    expect.toBeOneOf([
      expect.arrayContaining(
        [
          NotificationStateEnum.VALIDATED_API_CALL,
          NotificationStateEnum.PROCESSING,
          // TODO: Need a way to void test notification while adapter is not VOID.
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
  const status = result.body as INotificationStatus[];
  expect(status).toBeDefined();
  return status;
};

export const checkCampaignStatus = async (
  psoAPI: FetchService,
  campaignID: string
): Promise<{ PROCESSED: number; DISPATCHED: number }> => {
  try {
    const result = await psoAPI.get({ path: `/status/campaign/${campaignID}` });
    expect(result.body).toEqual(
      expect.objectContaining({
        CampaignID: campaignID,
        ProcessingSummary: expect.objectContaining({
          PROCESSED: expect.any(Number),
          DISPATCHED: expect.any(Number),
        }),
      })
    );
    const campaignStatus = result.body as CampaignStatus;
    expect(campaignStatus).toBeDefined();
    return campaignStatus.ProcessingSummary;
  } catch (error) {
    if (error instanceof FetchErrorResponse && error.status === 404) {
      throw new Error(`Campaign ${campaignID} not found yet (404) - retrying`);
    }
    throw error;
  }
};
