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
import { CreateBucketCommand, ListBucketsCommand, PutBucketVersioningCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { confirm } from '@inquirer/prompts';
import { $, file } from 'bun';
import { createHash } from 'node:crypto';

// Helper FN to simplify promise handling, and avoid nested try catches
const unwrap = async <Result>(promise: Promise<Result>): Promise<[Result, undefined] | [undefined, Error]> => {
  try {
    return [await promise, undefined];
  } catch (error) {
    return [undefined, error];
  }
};

const getConfig = async () => {
  const prefix = `gdsuns`;
  const suffix = `s3-tfstate`;

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

void (async function () {
  try {
    const tfvars = `./terraform/notifications/terraform.tfvars`;

    const { env, bucket, label } = await getConfig();

    // Ensure AWS env vars are available
    if (
      process.env.AWS_ACCESS_KEY_ID == undefined ||
      process.env.AWS_SECRET_ACCESS_KEY == undefined ||
      process.env.AWS_REGION == undefined
    ) {
      return console.log(
        `No AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY present in env vars, please use 'eval $(gds-cli aws {accountName} -e)'`
      );
    }

    // Fetch current account id
    const [stsClient, s3Client, ssmClient] = [new STSClient(), new S3Client(), new SSMClient()];
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
      }
    } else {
      console.log(`Developer tfstate bucket ${bucket} already exists in current ${accountIdHashed}`);
    }

    const useMtls = await confirm({ message: 'Would you like to enable mTLS?', default: false });

    // Save config to tfvars
    void file(tfvars).write(`# Auto-generated by ${import.meta.file}
# ${label}

bucket   = "${bucket}"
key      = "state.tfstate"
region   = "eu-west-2"
env      = "${env}"
use_mtls = ${useMtls}`);

    // Prompt to perform tf init
    if (await confirm({ message: `Would you like to initialize terraform?`, default: false })) {
      (
        await $.cwd('terraform/notifications')`terraform init \
      -backend-config "bucket=${bucket}" \
      -backend-config "key=state.tfstate" \
      -backend-config "region=eu-west-2"`
      ).text();
    }

    // Post initialization - check if SSM params are set and update them with values from dev env
    if (
      await confirm({
        message: `Would you like to import OneSignal API configuration values from dev env into sandbox?`,
        default: false,
      })
    ) {
      for (const param of [
        `config/dispatch/onesignal/apiKey`,
        `config/dispatch/onesignal/appId`,
        `config/dispatch/adapter`,
      ]) {
        // Build param paths
        const devParamName = `/gdsuns-dev/${param}`;
        const sandboxParamName = `/gdsuns-${env}/${param}`;

        // Fetch current param values from SSM
        const [getParameterResult, getParameterError] = await unwrap(
          ssmClient.send(
            new GetParameterCommand({
              Name: devParamName,
              WithDecryption: true,
            })
          )
        );
        const [getParameterSandboxResult, getParameterSandboxError] = await unwrap(
          ssmClient.send(
            new GetParameterCommand({
              Name: `${sandboxParamName}`,
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
          console.error(`Fetching error for ${devParamName}: ${getParameterError?.message}`);
          console.error(`Fetching error for ${sandboxParamName}: ${getParameterSandboxError?.message}`);
          console.error(
            `Failed to fetch params from dev & sandbox environments - make sure to perform initial release of your sandbox (npm run development:sandbox:release)`
          );
        }
      }
    }

    console.log(
      [
        ``,
        `Setup completed, now you can run: `,
        ` - npm run development:sandbox:release     - to trigger terraform apply for your environment`,
        ` - npm development:sandbox:release:plan    - to trigger terraform plan for your environment`,
      ].join('\n')
    );
  } catch (e) {
    // Gracefully handle command+c exits
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (e?.name == 'ExitPromptError') {
      console.log('\nCommand+c pressed, exiting...');
      return;
    }
    throw e;
  }
})();
