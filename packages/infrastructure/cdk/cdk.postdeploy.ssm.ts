/**
 * Due to CDK attempting to maintain configurable flags - this script is executed after the CDK Deployment
 * This way the SSM Values are created outside of the CDK Stack & modifications can persist
 */

import { APIGatewayClient, GetApiKeyCommand, GetApiKeysCommand, GetRestApisCommand } from '@aws-sdk/client-api-gateway';
import { DescribeSecretCommand, SecretsManagerClient, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { config } from './config';

await (async () => {
  //// =====================================================
  // Flex consumer secret setup
  //// =====================================================

  console.log(`Updating flex consumer secret`);
  const smClient = new SecretsManagerClient({ region: config.region });
  const apiGwClient = new APIGatewayClient({ region: config.region });
  const stsClient = new STSClient({ region: config.region });

  // Confirm secret we want to populate exists
  const secret = await smClient.send(
    new DescribeSecretCommand({
      SecretId: `${config.prefix}/flex/consumer`,
    })
  );
  if (secret == undefined) {
    throw new Error(`Failed fetching confirm flex consumer secret exists`);
  }

  // Find flex private api gateway
  const privateApiGw = ((await apiGwClient.send(new GetRestApisCommand({}))).items ?? []).find(
    (x) => x.name == config.utils.namingHelper(`apigw`, `flex-private`)
  );
  if (privateApiGw == undefined) {
    throw new Error(`Failed fetching private apigw used by flex`);
  }

  // Find relevant private api key
  const key = ((await apiGwClient.send(new GetApiKeysCommand({}))).items ?? []).find(
    (key) => key.name == config.utils.namingHelper(`flex-private`, `api-key`, `flex`)
  );
  if (key == undefined) {
    throw new Error(`Failed fetching flex API Key during`);
  }

  const keyValue = await apiGwClient.send(
    new GetApiKeyCommand({
      apiKey: key.id,
      includeValue: true,
    })
  );

  // Fetch current account
  const identityResult = await stsClient.send(new GetCallerIdentityCommand());
  if (identityResult == undefined) {
    return console.error(`Failed to fetch account ID`);
  }

  // Update value within the consumer secret
  await smClient.send(
    new UpdateSecretCommand({
      SecretId: `${config.prefix}/flex/consumer`,
      SecretString: JSON.stringify({
        apiKey: keyValue.value,
        apiUrl: '_',
        privateApiUrl: `https://${privateApiGw.id}.execute-api.eu-west-2.amazonaws.com/api`,
        roleArn: `arn:aws:iam::${identityResult.Account}:role/${config.utils.namingHelper('iamr-api-gateway', 'flex-private', 'private-invoker')}`,
        region: config.region,
      }),
    })
  );
})();
