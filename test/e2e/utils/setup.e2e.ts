import { APIGatewayClient, GetApiKeyCommand, GetApiKeysCommand } from '@aws-sdk/client-api-gateway';
import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Agent } from 'undici';

// Using relative over alias path for now until solution found
import { NotificationStateEnum } from '@common/models';
import { FetchService } from '@common/services/FetchService';
import { INotificationStatus } from '@project/lambdas';
import { config } from '../../../infrastructure/cdk/config';
import CustomWorld from '../utils/world';

export const domainName = (name: string, usePrivateDomain: boolean = false) => {
  if (name === 'flex' && usePrivateDomain) {
    if (!process.env.UNS_FLEX_BASE_URL) {
      throw new Error('UNS_FLEX_BASE_URL needs to be configured in the env varaibles');
    }
    return process.env.UNS_FLEX_BASE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  const rootDomain = config.ssm.hostedZoneName;
  const subdomain = name ? (config.isMainEnv || config.isEphemeral ? name : config.utils.namingHelper(name)) : null;
  return `${subdomain}.${rootDomain}`;
};

export const prepareDispatchConfig = async (world: CustomWorld) => {
  try {
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
    // New certificate format has two dates separated by dots cn.{startDate}.{endDate}
    secrets.SecretList = secrets.SecretList?.filter((x) => x.Name?.split(`.`).length == 3);

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
    let psoApiKey;
    let flexApiKey;

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
      if (value && value.value && key.name?.includes('flex') && key.name?.includes(world.flexKeyMarker)) {
        flexApiKey = value.value!;
      }
    }

    if (!psoApiKey) {
      throw new Error('Failed to retrieve API Token for PSO');
    }
    if (!flexApiKey) {
      throw new Error('Failed to retrieve API Token for FLEX');
    }

    // Creates a https agent for mTLS using imported credentials
    const httpsAgent = new Agent({
      connect: {
        cert: crt,
        key: key,
        rejectUnauthorized: false,
      },
    });

    return { httpsAgent, psoApiKey, flexApiKey };
  } catch (error) {
    console.error('Error setting up HTTPS Agent for end to end tests:', error);
    throw error;
  }
};

export const waitUntil = async <T>(fn: () => Promise<T>, { timeout = 30000, interval = 2000 }) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await fn();
      return;
    } catch {
      if (Date.now() + interval > deadline) throw new Error(`Timed out after ${timeout}ms`);
      await new Promise((r) => setTimeout(r, interval));
    }
  }
};

export const checkStatus = async (psoAPI: FetchService, notificationID: string) => {
  const result = await psoAPI.get({ path: `/status/${notificationID}` });
  const statuses = result.body as INotificationStatus[];
  const match = [
    NotificationStateEnum.VALIDATED_API_CALL,
    NotificationStateEnum.PROCESSING,
    // TODO: Need a way to void test notification while adapter is not VOID.
    // NotificationStateEnum.PROCESSED,
    // NotificationStateEnum.DISPATCHING
  ].every((expected) => statuses.map((s) => s.Status).includes(expected));

  if (!match) {
    throw new Error(`Missing status for ${notificationID}, got: ${statuses.map((s) => s.Status).join(', ')}`);
  }
  return statuses;
};
