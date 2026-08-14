/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { APIGatewayClient, GetApiKeyCommand, GetApiKeysCommand } from '@aws-sdk/client-api-gateway';
import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { FetchErrorResponse, FetchService } from '@common/services/FetchService';
import { CampaignStatus } from '@project/lambdas';
import { INotificationStatus } from '@project/lambdas/interfaces/INotificationStatus';
import { Agent } from 'undici';
import { test as baseTest } from 'vitest';
import { config } from '../../../infrastructure/cdk/config';

// Suppresses unnecessary console.logs from the OTEL metrics/tracers
vi.hoisted(() => {
  process.env.POWERTOOLS_DEV = 'true';
  process.env.POWERTOOLS_METRICS_DISABLED = 'false';
});

const domainName = (name: string) => {
  const rootDomain = config.ssm.hostedZoneName;
  const subdomain = name ? (config.isMainEnv ? name : config.utils.namingHelper(name)) : null;
  return `${subdomain}.${rootDomain}`;
};
const psoUrl = domainName(`pso`);
const flexUrl = domainName(`flex`);
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

    // Ensure AWS env vars are available
    if (
      process.env.AWS_ACCESS_KEY_ID == undefined ||
      process.env.AWS_SECRET_ACCESS_KEY == undefined ||
      process.env.AWS_REGION == undefined
    ) {
      throw new Error(
        `No AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY present in env vars, please use 'eval $(gds-cli aws {accountName} -e)'`
      );
    }

    // Retrieve mTLS certificates from parameter store for authenticating PSO and FLEX APIs
    const smClient = new SecretsManagerClient({ region: 'eu-west-2' });

    // Fetch dev certificates
    const secrets = await smClient.send(
      new ListSecretsCommand({
        Filters: [
          {
            Key: 'name',
            Values: [config.isMainEnv ? `uns-${config.env}/tls/UNS` : `uns-dev/tls/UNS`],
          },
        ],
      })
    );

    if (secrets.SecretList?.length !== 2) {
      throw new Error(`Fetching certs from SM returned too many results, expected 2`);
    }

    const result = (
      await Promise.all(
        (secrets.SecretList ?? [])
          .map((entry) => entry.Name!)
          .map((SecretId) =>
            smClient
              .send(
                new GetSecretValueCommand({
                  SecretId,
                })
              )
              .then((result) => ({ [SecretId.split('/').pop()!.split('-').pop()!]: result.SecretString }))
          )
      )
    ).reduce((a, b) => ({ ...a, ...b }), {}) as { crt: string; key: string };
    const { crt, key } = result;

    if (!crt || !key) {
      throw new Error('mTLS certificates were not returned from parameter store.');
    }

    // Fetch API Keys from usage plans on the fly
    const apiGwClient = new APIGatewayClient({ region: 'eu-west-2' });
    for (const key of ((await apiGwClient.send(new GetApiKeysCommand({}))).items ?? []).filter((key) =>
      key.name?.includes(config.prefix)
    )) {
      const value = await apiGwClient.send(
        new GetApiKeyCommand({
          apiKey: key.id,
          includeValue: true,
        })
      );

      // UNS is the org name attached to dev consumer definition
      if (value && value.value && key.name?.includes('pso') && key.name?.includes('uns')) {
        psoApiKey = value.value!;
      }

      // Our e2e tests are hitting flex api
      if (value && value.value && key.name?.includes('flex') && key.name?.includes('e2e')) {
        flexApiKey = value.value!;
      }
    }

    if (psoApiKey == '') {
      throw new Error('Failed to retrieve API Token for PSO');
    }
    if (flexApiKey == '') {
      throw new Error('Failed to retrieve API Token for FLEX');
    }

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
    flexAPI: new FetchService({
      baseUrl: `https://${flexUrl}`,
      defaultHeaders: {
        'x-api-key': flexApiKey,
      },
      defaultTimeout: 60000,
    }),
    flexAPIWithoutAPIKey: new FetchService({
      baseUrl: `https://${flexUrl}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
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
        dev: `dNVRHHR-Ik3vzs_QBsIv2WB7nCr-sROc6jIXxOqPRQQ`,
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
          // TODO: Need a way to void test notification while adapter is not VOID.
          // DISPATCHED: expect.any(Number),
        }),
      })
    );

    const campaignStatus = result.body as CampaignStatus;
    expect(campaignStatus).toBeDefined();
    return campaignStatus.ProcessingSummary;
  } catch (error) {
    if (error instanceof FetchErrorResponse && error.status === 404) {
      expect(error.status).not.toEqual(404);
      return { PROCESSED: 0, DISPATCHED: 0 };
    }
    throw error;
  }
};
