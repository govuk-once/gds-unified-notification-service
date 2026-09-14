// Downloads mTLS certificate pairs (private-key + crt) from AWS Secrets Manager.
// Secrets follow the naming convention: {prefix}/tls/{certificateId}/private-key and {prefix}/tls/{certificateId}/crt
//
// Usage:
//   pnpm run download:certificates
//   pnpm run download:certificates EventsAggregator
import { APIGatewayClient, GetApiKeyCommand, GetApiKeysCommand } from '@aws-sdk/client-api-gateway';
import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { select } from '@inquirer/prompts';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Colors, unwrap } from './helpers';

export interface CertificatePair {
  certificateId: string;
  prefix: string;
  crtSecretName: string;
  keySecretName: string;
}

const parseSecretName = (secretName: string) => {
  const tlsIndex = secretName.indexOf('/tls/');
  if (tlsIndex === -1) return undefined;

  const prefix = secretName.substring(0, tlsIndex);
  const afterTls = secretName.substring(tlsIndex + 5);
  const lastSlash = afterTls.lastIndexOf('/');
  if (lastSlash === -1) return undefined;

  const certificateId = afterTls.substring(0, lastSlash);
  const type = afterTls.substring(lastSlash + 1) as 'crt' | 'private-key';

  if (type !== 'crt' && type !== 'private-key') return undefined;

  return { prefix, certificateId, type };
};

export const listCertificatePairs = async (client: SecretsManagerClient): Promise<CertificatePair[]> => {
  const allSecrets: string[] = [];
  let nextToken: string | undefined;

  do {
    const [result, error] = await unwrap(
      client.send(
        new ListSecretsCommand({
          MaxResults: 100,
          NextToken: nextToken,
          IncludePlannedDeletion: false,
        })
      )
    );

    if (error) {
      throw new Error(`Failed to list secrets: ${error.message}`);
    }

    for (const secret of result.SecretList ?? []) {
      if (secret.Name && !secret.DeletedDate) {
        allSecrets.push(secret.Name);
      }
    }

    nextToken = result.NextToken;
  } while (nextToken);

  const pairMap = new Map<string, { crt?: string; key?: string; prefix: string }>();

  for (const name of allSecrets) {
    const parsed = parseSecretName(name);
    if (!parsed) continue;

    const pairKey = `${parsed.prefix}/${parsed.certificateId}`;
    const existing = pairMap.get(pairKey) ?? { prefix: parsed.prefix };

    if (parsed.type === 'crt') {
      existing.crt = name;
    } else {
      existing.key = name;
    }

    pairMap.set(pairKey, existing);
  }

  const pairs: CertificatePair[] = [];
  for (const [, value] of pairMap) {
    if (value.crt && value.key) {
      const parsed = parseSecretName(value.crt)!;
      pairs.push({
        certificateId: parsed.certificateId,
        prefix: parsed.prefix,
        crtSecretName: value.crt,
        keySecretName: value.key,
      });
    }
  }

  return pairs.sort((a, b) => a.certificateId.localeCompare(b.certificateId));
};

export const fetchCertificateValues = async (
  client: SecretsManagerClient,
  pair: CertificatePair
): Promise<{ crt: string; key: string }> => {
  const [results, error] = await unwrap(
    Promise.all([
      client.send(new GetSecretValueCommand({ SecretId: pair.crtSecretName })),
      client.send(new GetSecretValueCommand({ SecretId: pair.keySecretName })),
    ])
  );

  if (error) {
    throw new Error(`Failed to fetch certificate values: ${error.message}`);
  }

  const crt = results[0].SecretString;
  const key = results[1].SecretString;

  if (!crt || !key) {
    throw new Error(`Certificate or key value was empty for ${pair.certificateId}`);
  }

  return { crt, key };
};

export const fetchMatchingPsoApiKey = async (
  client: APIGatewayClient,
  prefix: string,
  certificateId: string
): Promise<string | undefined> => {
  const psoKeyPrefix = `${prefix}-pso-api-key`;
  const keys: { name: string; id: string }[] = [];
  let position: string | undefined;

  do {
    const [result, error] = await unwrap(
      client.send(new GetApiKeysCommand({ nameQuery: psoKeyPrefix, limit: 500, position }))
    );

    if (error) return undefined;

    for (const key of result.items ?? []) {
      if (key.name && key.id) {
        keys.push({ name: key.name, id: key.id });
      }
    }

    position = result.position;
  } while (position);

  const matchedKey = keys.find((key) => {
    const org = key.name.slice(psoKeyPrefix.length + 1);
    return certificateId.toLowerCase().startsWith(`${org}-`);
  });

  if (!matchedKey) return undefined;

  const [result, error] = await unwrap(
    client.send(new GetApiKeyCommand({ apiKey: matchedKey.id, includeValue: true }))
  );

  if (error) return undefined;
  return result.value;
};

const downloadPair = async (client: SecretsManagerClient, pair: CertificatePair, outputDir: string): Promise<void> => {
  console.log(`\nDownloading ${Colors.cyan(pair.certificateId)}...`);

  const { crt, key } = await fetchCertificateValues(client, pair);

  const crtPath = resolve(outputDir, `${pair.certificateId}.crt`);
  const keyPath = resolve(outputDir, `${pair.certificateId}.key`);

  writeFileSync(crtPath, crt, { encoding: 'utf-8' });
  writeFileSync(keyPath, key, { encoding: 'utf-8', mode: 0o600 });

  console.log(`  ${Colors.green('crt')} -> ${crtPath}`);
  console.log(`  ${Colors.green('key')} -> ${keyPath}`);
};

const script = async function () {
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

  try {
    const smClient = new SecretsManagerClient({ region: 'eu-west-2' });
    const filter = process.argv[2]?.toLowerCase();

    console.log(`\nListing TLS certificate pairs...`);
    const allPairs = await listCertificatePairs(smClient);
    const pairs = filter
      ? allPairs.filter((p) => `${p.prefix}/tls/${p.certificateId}`.toLowerCase().includes(filter))
      : allPairs;

    if (pairs.length === 0) {
      console.log(Colors.yellow(filter ? `No certificate pairs matching "${filter}".` : 'No certificate pairs found.'));
      process.exit(0);
    }

    console.log(`Found ${Colors.green(String(pairs.length))} certificate pair(s)\n`);

    const selectedPair =
      pairs.length === 1
        ? pairs[0]
        : await select({
            message: 'Select a certificate pair to download:',
            choices: pairs.map((pair) => ({
              name: `${pair.prefix}/tls/${pair.certificateId}`,
              value: pair,
            })),
          });

    const outputDir = process.cwd();
    await downloadPair(smClient, selectedPair, outputDir);

    console.log(`\n${Colors.green('Done!')} Downloaded certificate pair to ${outputDir}`);

    // Auto-match PSO API key by organization
    const apiGwClient = new APIGatewayClient({ region: 'eu-west-2' });

    console.log(`\nLooking up matching PSO API key...`);
    const apiKeyValue = await fetchMatchingPsoApiKey(apiGwClient, selectedPair.prefix, selectedPair.certificateId);

    if (apiKeyValue) {
      console.log(`  ${Colors.cyan('x-api-key')}: ${apiKeyValue}`);
    } else {
      console.log(Colors.yellow('No matching PSO API key found for this certificate.'));
    }
  } catch (e) {
    if ((e as Error)?.name == 'ExitPromptError') {
      console.log('\nCommand+c pressed, exiting...');
      return;
    }
    throw e;
  }
};

if (process.argv.includes(import.meta.filename) == true) {
  await script();
}
