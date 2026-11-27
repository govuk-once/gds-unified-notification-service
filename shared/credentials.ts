import { APIGatewayClient, GetApiKeyCommand, GetApiKeysCommand, GetRestApisCommand } from '@aws-sdk/client-api-gateway';
import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { config } from '@infra/cdk/config';

export interface ApiKeys {
  psoApiKey: string;
  flexApiKey: string;
}

export interface MtlsCertificates {
  crt: string;
  key: string;
}

export interface Domains {
  flex: string;
  pso: string;
}
export const domainName = async (name: string, usePrivateDomain: boolean = false) => {
  if (name === 'flex' && usePrivateDomain) {
    const apiGwClient = new APIGatewayClient({ region: config.region });
    const flexPrivateName = config.utils.namingHelper('apigw', 'flex-private');
    const apis = await apiGwClient.send(new GetRestApisCommand({ limit: 500 }));
    const api = apis.items?.find((a) => a.name === flexPrivateName);
    if (!api?.id) {
      throw new Error(`Could not find private flex API Gateway: ${flexPrivateName}`);
    }
    return `${api.id}.execute-api.${config.region}.amazonaws.com/api`;
  }
  const rootDomain = config.ssm.hostedZoneName;
  const subdomain = name
    ? config.isPersistentEnv || config.isEphemeral
      ? name
      : config.utils.namingHelper(name)
    : null;
  return `${subdomain}.${rootDomain}`;
};

export const resolveDomains = async (usePrivateGateway: boolean): Promise<Domains> => {
  const pso = await domainName(`pso`);
  const flex = await domainName(`flex`, usePrivateGateway);
  return { pso, flex };
};

export async function fetchApiKeys(flexKeyMarker: string): Promise<ApiKeys> {
  const apiGwClient = new APIGatewayClient({ region: config.region });
  const apiKeys: ApiKeys = {
    psoApiKey: '',
    flexApiKey: '',
  };

  const keys = (await apiGwClient.send(new GetApiKeysCommand({ nameQuery: config.prefix, limit: 1000 }))).items ?? [];

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
  const secretPrefix = config.isPersistentEnv ? `uns-${config.env}/tls/UNS` : `uns-dev/tls/UNS`;

  const secrets = await smClient.send(
    new ListSecretsCommand({
      Filters: [{ Key: 'name', Values: [secretPrefix] }],
    })
  );

  const now = new Date();
  const validSecrets = (secrets.SecretList ?? []).filter((x) => {
    if (!x.Name) return false;

    const parts = x.Name.split('.');
    if (parts.length !== 3) return false;

    const startDate = new Date(parts[1]);
    const endDate = new Date(parts[2].split('/')[0]);

    const isValidRange = Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime());
    return isValidRange && now >= startDate && now <= endDate;
  });

  const validCertsByLatestExpiry = validSecrets
    .filter((x) => x.Name!.endsWith('/crt'))
    .sort((a, b) => {
      const endDateA = new Date(a.Name!.split('.')[2].split('/')[0]).getTime();
      const endDateB = new Date(b.Name!.split('.')[2].split('/')[0]).getTime();
      return endDateB - endDateA;
    });

  if (validCertsByLatestExpiry.length === 0) {
    throw new Error(`No valid cert found under ${secretPrefix}`);
  }

  for (const certName of validCertsByLatestExpiry) {
    const baseName = certName.Name!.split('/').slice(0, -1).join('/');
    const keyEntry = validSecrets.find((x) => x.Name === `${baseName}/private-key`);

    if (!keyEntry?.Name) {
      console.error(`No matching key found for cert ${certName.Name!}`);
      continue;
    }

    const [crt, key] = await Promise.all([
      smClient.send(new GetSecretValueCommand({ SecretId: certName.Name! })).then((r) => r.SecretString),
      smClient.send(new GetSecretValueCommand({ SecretId: keyEntry.Name })).then((r) => r.SecretString),
    ]);

    if (!crt || !key) {
      console.error('mTLS certificates were not returned from Secrets Manager for the prefix');
      continue;
    }
    return { crt, key };
  }

  throw new Error('mTLS certificates were not returned from Secrets Manager.');
}
