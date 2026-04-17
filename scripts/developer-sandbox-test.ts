// This script is to be executed via npm run development:sandbox:test
// Downloads mTLS certificates to local repository for authentication
// Fetches custom domain name for environment
// Both are used for end to end testing
//
// Usage:
//   Developer sandbox testing setup
//     npm run development:sandbox:test
//
//   Changing to your colleagues dev environment (pair coding, debugging etc.)
//     AS_DEVELOPER={their_email} npm run development:sandbox:test
//
//   Changing to environment (i.e. dev, staging etc)
//     AS_ENVIRONMENT={dev} npm run development:sandbox:test
//
//   Note: This generator should only be used for setting bucket configuration.
import { APIGatewayClient, GetDomainNamesCommand } from '@aws-sdk/client-api-gateway';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { confirm } from '@inquirer/prompts';
import { writeFile } from 'node:fs/promises';
import { getConfig } from 'scripts/developer-sandbox-setup';

const s3Client = new S3Client();

const script = async function () {
  try {
    const { env } = await getConfig();

    // mTLS and Domain Name import
    let mtlsEnvToUse;

    if (
      await confirm({
        message: 'Would you like to use dev envs mTLS config instead of your own sandbox?',
        default: true,
      })
    ) {
      mtlsEnvToUse = 'dev';
    } else {
      mtlsEnvToUse = env;
    }

    const targetBucket = `gdsunsmtls-${mtlsEnvToUse}-s3-mtls-client-certificates`;
    const targetKey = `gdsunsmtls-${mtlsEnvToUse}/dev/dev-2026-Q1-Q2`;

    for (const fileExt of ['crt', 'pem']) {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: targetBucket,
          Key: `${targetKey}.${fileExt}`,
        })
      );

      const fileOutput = await response.Body?.transformToByteArray();
      if (!fileOutput) {
        throw new Error();
      }

      // Now you can use writeFile
      await writeFile(`./test/e2e/config/cert-file.${fileExt}`, fileOutput);
    }

    const gatewayClient = new APIGatewayClient();
    const domains = await gatewayClient.send(new GetDomainNamesCommand());

    const psoCustomeDomainName = domains.items?.filter((x) => (x.domainName as string)?.includes(`gdsuns-${env}-pso`));
    const flexCustomeDomainName = domains.items?.filter((x) =>
      (x.domainName as string)?.includes(`gdsuns-${env}-flex`)
    );

    if (psoCustomeDomainName && flexCustomeDomainName) {
      const fileOutput = `AWS_PSO_CUSTOM_DOMAIN_NAME=${psoCustomeDomainName[0].domainName}\nAWS_FLEX_CUSTOM_DOMAIN_NAME=${flexCustomeDomainName[0].domainName}`;
      await writeFile(`./.env`, fileOutput);
    }
  } catch (e) {
    // Gracefully handle command+c exits
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (e?.name == 'ExitPromptError') {
      console.log('\nCommand+c pressed, exiting...');
      return;
    }
    throw e;
  }
};

if (process.argv.includes(import.meta.filename) == true) {
  await script();
}
