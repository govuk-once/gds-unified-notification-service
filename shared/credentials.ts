import { APIGatewayClient, GetApiKeyCommand, GetApiKeysCommand } from '@aws-sdk/client-api-gateway';
import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { config } from '../infrastructure/cdk/config';

export interface ApiKeys {
  psoApiKey: string;
  flexApiKey: string;
}

export interface MtlsCertificates {
  crt: string;
  key: string;
}

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

export async function fetchApiKeys(flexKeyMarker: string): Promise<ApiKeys> {
  const apiGwClient = new APIGatewayClient({ region: config.region });
  const apiKeys: ApiKeys = {
    psoApiKey: '',
    flexApiKey: '',
  };

  const keys = ((await apiGwClient.send(new GetApiKeysCommand({}))).items ?? []).filter((key) =>
    key.name?.includes(config.prefix)
  );

  for (const key of keys) {
    const value = await apiGwClient.send(
      new GetApiKeyCommand({
        apiKey: key.id,
        includeValue: true,
      })
    );

    if (value?.value && key.name?.includes('pso') && key.name?.includes('uns')) {
      apiKeys.psoApiKey = value.value;
    }

    if (value?.value && key.name?.includes('flex') && key.name?.includes(flexKeyMarker)) {
      apiKeys.flexApiKey = value.value;
    }
  }

  if (!apiKeys.psoApiKey) {
    throw new Error('Failed to retrieve API Token for PSO');
  }
  if (!apiKeys.flexApiKey) {
    throw new Error('Failed to retrieve API Token for FLEX');
  }

  return apiKeys;
}

export async function fetchMtlsCertificates(): Promise<MtlsCertificates> {
  const smClient = new SecretsManagerClient({ region: config.region });
  const secretPrefix = config.isMainEnv ? `uns-${config.env}/tls/UNS` : `uns-dev/tls/UNS`;

  const secrets = await smClient.send(
    new ListSecretsCommand({
      Filters: [{ Key: 'name', Values: [secretPrefix] }],
    })
  );

  // New certificate format has two dates separated by dots cn.{startDate}.{endDate}
  const filtered = (secrets.SecretList ?? []).filter((x) => x.Name?.split('.').length == 3);

  if (filtered.length !== 2) {
    throw new Error(`Fetching certs from SM returned unexpected number of results, expected 2 got ${filtered.length}`);
  }

  // Fetch the values for the filtered secrets
  const result = await Promise.all(
    filtered
      .map((entry) => entry.Name!)
      .map((SecretId) =>
        smClient
          .send(new GetSecretValueCommand({ SecretId }))
          .then((result) => ({ [SecretId.split('/').pop()!.split('-').pop()!]: result.SecretString }))
      )
  );

  const crt = result.find((x) => x.crt)?.crt;
  const key = result.find((x) => x.key)?.key;

  if (!crt || !key) {
    throw new Error('mTLS certificates were not returned from parameter store.');
  }

  return { crt, key };
}
