/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// This script is to be executed via npm run development:sandbox:setup
// Generates environment ID based on email signing the commits (git config -- set user.email) by default (directly configurable options available below)
// Saves generated config into teraform/notifications/terraform.tfvars
// If AWS environment variables are present
// - prompts the creation if tfstate bucket does not exist
// - prompts terraform initiation
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
import { APIGatewayClient, GetDomainNamesCommand } from '@aws-sdk/client-api-gateway';
import {
  CopyObjectCommand,
  CreateBucketCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { GetParameterCommand, GetParametersByPathCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { confirm } from '@inquirer/prompts';
import { $, file } from 'bun';
import { createHash } from 'node:crypto';
import { writeFile } from 'fs/promises';
import { v7 as ulid } from 'uuid';

// Helper FN to simplify promise handling, and avoid nested try catches
const unwrap = async <Result>(promise: Promise<Result>): Promise<[Result, undefined] | [undefined, Error]> => {
  try {
    return [await promise, undefined];
  } catch (error) {
    return [undefined, error];
  }
};

export const prefix = `gdsuns`;
export const suffix = `s3-tfstate`;

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
const [stsClient, s3Client, ssmClient] = [new STSClient(), new S3Client(), new SSMClient()] as const;

export const getConfig = async () => {
  // Allow running `AS_ENVIRONMENT=dev npm run development:sandbox:setup` to repoint local TF to non sandbox setups
  if (process.env.AS_ENVIRONMENT !== undefined) {
    return {
      label: `For ${process.env.AS_ENVIRONMENT}`,
      env: process.env.AS_ENVIRONMENT,
      bucket: `${prefix}-${process.env.AS_ENVIRONMENT}-${suffix}`,
    };
  }

  const email = process.env.AS_DEVELOPER
    ? process.env.AS_DEVELOPER
    : (await $`git config --get user.email`).text().trim();

  // Generate Developer TF State bucket name based of email address configured within their Git
  const hash = createHash('md5').update(email).digest('hex').substring(4, 8);
  const env = `${email.split('.').shift()}-${hash}`;

  return {
    label: `For developer: ${email}`,
    env,
    bucket: `${prefix}-${env}-${suffix}`,
  };
};

export const importSSMNamespace = async (env: string, label: string, namespace: string) => {
  if (
    await confirm({
      message: `Would you like to import ${label} configuration values from dev env into sandbox?`,
      default: false,
    })
  ) {
    const params = (
      (
        await ssmClient.send(
          new GetParametersByPathCommand({
            Path: `/gdsuns-dev/${namespace}`,
            Recursive: true,
            WithDecryption: true,
            MaxResults: 10,
          })
        )
      ).Parameters ?? []
    ).map((p) => p.Name!);

    for (const param of params) {
      // Build param paths
      const sandboxParamName = param.replace(`/gdsuns-dev/`, `/gdsuns-${env}/`);

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
    const tfvars = `./terraform/notifications/terraform.tfvars`;

    const { env, bucket, label } = await getConfig();

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

    // Fetch buckets
    const [listBucketsResult, listBucketsError] = await unwrap(s3Client.send(new ListBucketsCommand()));
    if (listBucketsResult == undefined) {
      return console.error(`Failed to fetch buckets: ${listBucketsError.message}`);
    }

    // Prompt bucket creation if the state storage doesnt exist
    if (listBucketsResult.Buckets?.map((bucket) => bucket.Name)?.includes(bucket) == false) {
      // Prompt to create a bucket outlining AWS account used
      if (await confirm({ message: `Would you like to create ${bucket} in ${accountIdHashed}` })) {
        const [createBucketResult, createBucketError] = await unwrap(
          s3Client.send(new CreateBucketCommand({ Bucket: bucket, ACL: 'private' }))
        );
        if (createBucketResult == undefined) {
          return console.error(`Failed creation of a ${bucket}: ${createBucketError.message}`);
        }
        console.log(`Created ${bucket} in ${createBucketResult.Location} ARN: ${createBucketResult.BucketArn}`);

        // Enable versioning on the bucket
        const [putBucketVersioningResult, putBucketVersioningError] = await unwrap(
          s3Client.send(
            new PutBucketVersioningCommand({
              Bucket: bucket,
              VersioningConfiguration: {
                Status: 'Enabled',
              },
            })
          )
        );

        if (putBucketVersioningResult == undefined) {
          return console.error(`Failed enabling of versioning on ${bucket}: ${putBucketVersioningError.message}`);
        }
        console.log(`Enabled versioning on the bucket`);
      } else {
        console.log(`Developer tfstate bucket ${bucket} already exists in current ${accountIdHashed}`);
      }
    }

    // Conditionally enable mTLS
    const useMtls = await confirm({ message: 'Would you like to enable mTLS?', default: true });
    let mtlsEnvToUse: null | string = null;
    let truststoreOverride: null | string = null;
    if (useMtls) {
      mtlsEnvToUse = env;
      if (
        await confirm({
          message: 'Would you like to use dev envs mTLS config instead of your own sandbox?',
          default: true,
        })
      ) {
        mtlsEnvToUse = 'dev';
        // Prompt whether a new copy of truststore should be created
        if (
          await confirm({
            message: 'Would you like to create a copy of the truststore from dev?',
            default: true,
          })
        ) {
          const targetBucket = `gdsunsmtls-${mtlsEnvToUse}-s3-mtls-certificate`;
          const targetKey = `trustore.${env}.${ulid()}.pem`;
          await s3Client.send(
            new CopyObjectCommand({
              CopySource: `${targetBucket}/truststore.pem`,
              Bucket: targetBucket,
              Key: targetKey,
            })
          );
          truststoreOverride = `${targetBucket}/${targetKey}`;
          console.log(` - Created ${truststoreOverride}`);
        }
      }
    }

    // Save config to tfvars
    void file(tfvars).write(`# Auto-generated by ${import.meta.file}
# ${label}

bucket              = "${bucket}"
key                 = "state.tfstate"
region              = "eu-west-2"
env                 = "${env}"
use_mtls            = ${useMtls}
mtls_env_to_use     = ${mtlsEnvToUse == null ? mtlsEnvToUse : `"${mtlsEnvToUse}"`}
truststore_override = ${truststoreOverride == null ? truststoreOverride : `"s3://${truststoreOverride}"`}`);

    // Prompt to perform tf init
    if (await confirm({ message: `Would you like to initialize terraform?`, default: true })) {
      (
        await $.cwd('terraform/notifications')`terraform init -reconfigure \
      -backend-config "bucket=${bucket}" \
      -backend-config "key=state.tfstate" \
      -backend-config "region=eu-west-2"`
      ).text();
    }

    // Post initialization - check if SSM params are set and update them with values from dev env
    await importSSMNamespace(env, 'Dispatch (OneSignal)', `config/dispatch`);
    await importSSMNamespace(env, 'Processing (UDP)', `config/processing`);
    console.log(
      [
        ``,
        `Setup completed, now you can run: `,
        ` - npm run development:sandbox:release     - to trigger terraform apply for your environment`,
        ` - npm development:sandbox:release:plan    - to trigger terraform plan for your environment`,
      ].join('\n')
    );

    // mTLS and Domain Name import
    if (useMtls) {
      const targetBucket = `gdsunsmtls-${mtlsEnvToUse}-s3-mtls-client-certificates`;
      const targetKey = `gdsunsmtls-dev/dev/dev-2026-Q1-Q2`;

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
        await writeFile(`./tests/e2e/config/cert-file.${fileExt}`, fileOutput);
      }
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
