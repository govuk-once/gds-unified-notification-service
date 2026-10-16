import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { FetchErrorResponse, FetchService } from '@common/services/FetchService';
import { FetchSigV4Service } from '@common/services/FetchSigV4Service';
import { CampaignStatus } from '@project/lambdas';
import { INotificationStatus } from '@project/lambdas/interfaces/INotificationStatus';
import { Agent, fetch as undiciFetch } from 'undici';
import { test as baseTest, inject } from 'vitest';
import { config } from '../../../infrastructure/cdk/config';

// Suppresses unnecessary console.logs from the OTEL metrics/tracers
vi.hoisted(() => {
  process.env.POWERTOOLS_DEV = 'true';
  process.env.POWERTOOLS_METRICS_DISABLED = 'false';
});

let httpsAgent: Agent;

let psoUrl = '';
let flexUrl = '';
let psoApiKey = '';
let flexApiKey = '';

const prepareBeforeAll = () => {
  try {
    const e2eCredentials = inject('e2eCredentials');

    psoUrl = e2eCredentials.psoUrl;
    flexUrl = e2eCredentials.flexUrl;
    psoApiKey = e2eCredentials.psoApiKey;
    flexApiKey = e2eCredentials.flexApiKey;

    if (!psoUrl || !flexUrl) {
      throw new Error(
        'Domain names are not setup for end to end testing, please run development:sandbox:setup to configure.'
      );
    }

    process.env.PREFIX = `uns-${config.env}`;

    // Creates a https agent for mTLS using imported credentials
    httpsAgent = new Agent({
      connect: {
        cert: e2eCredentials.crt,
        key: e2eCredentials.key,
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

beforeAll(() => prepareBeforeAll());

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
      fetchImpl: undiciFetch,
    }),
    psoAPIWithoutAPIKey: new FetchService({
      baseUrl: `https://${psoUrl}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: httpsAgent as unknown as never,
      },
      fetchImpl: undiciFetch,
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
      fetchImpl: undiciFetch,
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
