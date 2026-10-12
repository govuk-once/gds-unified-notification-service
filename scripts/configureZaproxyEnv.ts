import { domainName, fetchApiKeys, fetchMtlsCertificates } from '@shared/credentials';
import { parseArgs } from 'node:util';
import { config } from '../infrastructure/cdk/config';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

async function configureZaproxyEnvironmentVars(target: string): Promise<void> {
  const usePrivateGateway = config.isE2ERunner;
  const flexKeyMarker = usePrivateGateway ? 'private' : 'e2e';
  const password = 'zap-mtls';
  const { psoApiKey, flexApiKey } = await fetchApiKeys(flexKeyMarker);
  const { crt, key } = await fetchMtlsCertificates();

  // Set the correct target URL and API key based on target
  switch (target) {
    case 'pso':
      const psoUrl = 'https://' + domainName('pso');
      console.log(`export TARGET_URL=${psoUrl}`);
      console.log(`export X_API_KEY=${psoApiKey}`);
      break;
    case 'flex':
      const flexUrl = 'https://' + domainName('flex', usePrivateGateway);
      console.log(`export TARGET_URL=${flexUrl}`);
      console.log(`export X_API_KEY=${flexApiKey}`);
      break;
    default:
      throw new Error(`Target: ${target} is not valid`);
  }

  // Generate the p12 file for mTLS
  fs.writeFileSync('tls.crt', crt, { encoding: 'utf-8' });
  fs.writeFileSync('tls.key', key, { encoding: 'utf-8' });
  execSync(`openssl pkcs12 -export -out client.p12 -inkey tls.key -in tls.crt -passout pass:${password}`, {
    encoding: 'utf-8',
  });
  console.log(`export TLS_PASSWORD=${password}`);
  console.log(`export TARGET_SPEC=${target}`);
}

const ALLOWED_TARGETS = ['flex', 'pso'];
const { values } = parseArgs({
  options: {
    target: {
      type: 'string',
    },
  },
});

if (!values.target || !ALLOWED_TARGETS.includes(values.target)) {
  throw new Error(`--target is invalid`, {
    cause: `Valid options are one from [${ALLOWED_TARGETS.join(',')}]`,
  });
}

await configureZaproxyEnvironmentVars(values.target);
