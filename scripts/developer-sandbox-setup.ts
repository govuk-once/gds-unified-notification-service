// This script is to be executed via npm run development:sandbox:setup
// Generates environment ID based on email signing the commits (git config -- set user.email) by default (directly configurable options available below)
// Saves generated config into infrastructure/cdk/.env
// If AWS environment variables are present
// - prompts mirroring SSM values from DEV to Developers-sandbox
//
// Usage:
//   Developer sandbox setup
//     npm run development:sandbox:setup
//
//   Changing to your colleagues dev environment (pair coding, debugging etc.)
//     AS_DEVELOPER={their_email} npm run development:sandbox:setup
//
//   Changing to environment (i.e. dev, staging etc)
//     AS_ENVIRONMENT={dev} npm run development:sandbox:setup
//
//   Note: This generator should only be used for setting bucket configuration.
import { GetParameterCommand, GetParametersByPathCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { confirm } from '@inquirer/prompts';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { unwrap } from 'scripts/helpers';

// Ensure AWS env vars are available
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
const [stsClient, ssmClient] = [new STSClient(), new SSMClient()] as const;

export const getConfig = () => {
  // Allow running `AS_ENVIRONMENT=dev npm run development:sandbox:setup` to repoint local TF to non sandbox setups
  if (process.env.AS_ENVIRONMENT !== undefined) {
    return {
      label: `For ${process.env.AS_ENVIRONMENT}`,
      env: process.env.AS_ENVIRONMENT,
    };
  }

  const email = process.env.AS_DEVELOPER
    ? process.env.AS_DEVELOPER
    : execSync(`git config --get user.email`).toString().trim();
  // Generate Developer TF State bucket name based of email address configured within their Git
  const hash = createHash('md5').update(email).digest('hex').substring(4, 8);
  const env = `${email.split('.').shift()}-${hash}`;

  return {
    label: `For developer: ${email}`,
    env,
  };
};

export const importSSMNamespace = async (env: string, label: string, namespaces: string[]) => {
  if (
    await confirm({
      message: `Would you like to import ${label} configuration values from dev env into sandbox?`,
      default: false,
    })
  ) {
    const params: string[] = [];
    for (const namespace of namespaces) {
      params.push(
        ...(
          (
            await ssmClient.send(
              new GetParametersByPathCommand({
                Path: `/uns-dev/${namespace}`,
                Recursive: true,
                WithDecryption: true,
                MaxResults: 10,
              })
            )
          ).Parameters ?? []
        ).map((p) => p.Name!)
      );
    }

    for (const param of params) {
      // Build param paths

      // Note: CDK Migration is dropping gds prefix in SSM
      const sandboxParamName = param.replace(`/uns-dev/`, `/uns-${env}/`);

      // Fetch current param values from SSM
      const [getParameterResult, getParameterError] = await unwrap(
        ssmClient.send(
          new GetParameterCommand({
            Name: param,
            WithDecryption: true,
          })
        )
      );
      const [getParameterSandboxResult, getParameterSandboxError] = await unwrap(
        ssmClient.send(
          new GetParameterCommand({
            Name: sandboxParamName,
            WithDecryption: true,
          })
        )
      );

      // Only if both values exist -
      if (getParameterResult && getParameterSandboxResult) {
        const [dev, sandbox] = [getParameterResult.Parameter?.Value, getParameterSandboxResult.Parameter?.Value];
        if (getParameterSandboxResult.Parameter?.Value == undefined) {
          console.log(
            `Parameter has not been initialized yet, please run npm run development:sandbox:release to deploy your environment first then come back to this flow.`
          );
          continue;
        }

        // Prompt user whether the update should be set
        console.log(`Parameter: ${param}`);
        console.log(`Parameter sandbox: ${sandboxParamName}`);
        if (getParameterResult.Parameter?.Value !== getParameterSandboxResult.Parameter?.Value) {
          console.log(`Sandbox: ${sandbox}`);
          console.log(`Dev: ${dev}`);
          if (await confirm({ message: `Would you like to import new value?` })) {
            const [putParameterResult, putParameterError] = await unwrap(
              ssmClient.send(
                new PutParameterCommand({
                  Name: sandboxParamName,
                  Value: dev,
                  Type: 'SecureString',
                  Overwrite: true,
                })
              )
            );
            if (putParameterResult) {
              console.log(`Updated succesfully`);
            } else {
              console.error(`Update of ${sandboxParamName} has failed: ${putParameterError.message}`);
            }
          }
        } else {
          console.log(`Values already match, skipping...`);
        }
      } else {
        console.error(`Fetching error for ${param}: ${getParameterError?.message}`);
        console.error(`Fetching error for ${sandboxParamName}: ${getParameterSandboxError?.message}`);
        console.error(
          `Failed to fetch params from dev & sandbox environments - make sure to perform initial release of your sandbox (npm run development:sandbox:release)`
        );
      }
    }
  }
};

const script = async function () {
  try {
    const cdk = `./infrastructure/cdk/.env`;

    const { env, label } = getConfig();

    // Fetch current account id
    const [identityResult, identityError] = await unwrap(stsClient.send(new GetCallerIdentityCommand()));
    if (identityResult == undefined) {
      return console.error(`Failed to fetch account ID :${identityError.message}`);
    }

    // Only log last 4 digits of account id
    const id = identityResult.Account ?? '';
    const accountIdHashed = id.substring(8).padStart(id.length, '*');

    // Detect if the env variables point outside of development account
    if (accountIdHashed.endsWith('7518') == false) {
      if (
        (await confirm({
          message: `AWS Account ${accountIdHashed} does not end with 7518 (development account), are you sure you want to continue?`,
        })) == false
      ) {
        return console.log(`Exiting`);
      }
    }

    // Save config to cdk env
    void writeFileSync(
      cdk,
      `# Auto-generated by ${import.meta.filename}
# ${label}

region=eu-west-2
env=${env}
use_mtls=true`,
      { encoding: 'utf-8' }
    );

    console.log(`Config generated & saved to ${cdk}`);

    // Post initialization - check if SSM params are set and update them with values from dev env
    await importSSMNamespace(env, 'Dispatch (OneSignal)', [`config/dispatch`]);
    await importSSMNamespace(env, 'Processing (UDP)', [`config/processing`, `udp/config`]);
    console.log(
      [
        ``,
        `Setup completed, now you can run: `,
        ` - npm run cdk:diff       - to preview CDK changes before applying`,
        ` - npm run cdk:deploy     - to apply CDK changes & release your environment`,
      ].join('\n')
    );
  } catch (e) {
    // Gracefully handle command+c exits

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
