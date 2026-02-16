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
import { ListHostedZonesByNameCommand, Route53Client } from '@aws-sdk/client-route-53';
import { CreateBucketCommand, ListBucketsCommand, PutBucketVersioningCommand, S3Client } from '@aws-sdk/client-s3';
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
  const tfvars = `./terraform/notifications/terraform.tfvars`;
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
  const [stsClient, s3Client, route53Client] = [new STSClient(), new S3Client(), new Route53Client()];
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

  // Generate unique values based on github user email and/or env vars
  const { label, env, bucket } = await getConfig();

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

  // Fetch hosted zone
  const [zones, zoneErrors] = await unwrap(route53Client.send(new ListHostedZonesByNameCommand({})));
  if (zones == undefined) {
    console.error(zoneErrors);
    return console.error(`Failed fetching hosted zones`);
  }

  // Find root hostedZone that has already been setup in AWS by the platform team
  const hostedZoneName = (zones.HostedZones ?? []).find((zone) => zone.Name?.endsWith('gov.uk.'));
  if (hostedZoneName == undefined) {
    return console.error(`Failed to fetch hosted domain - has it been setup within the AWS account?`);
  }

  // Save vars the file
  void file(tfvars).write(`# Auto-generated by ${import.meta.file}
# ${label}

bucket         = "${bucket}"
key            = "state.tfstate"
region         = "eu-west-2"
env            = "${env}"
account_domain = "${hostedZoneName.Name?.replace('gov.uk.', 'gov.uk')}"
`);

  // Prompt to perform tf init
  if (await confirm({ message: `Would you like to initialize terraform?` })) {
    (
      await $.cwd('terraform/notifications')`terraform init -upgrade \
        -backend-config "bucket=${bucket}" \
        -backend-config "key=state.tfstate" \
        -backend-config "region=eu-west-2"`
    ).text();
  }
})();
