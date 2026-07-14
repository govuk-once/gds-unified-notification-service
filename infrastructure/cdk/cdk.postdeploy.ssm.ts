/**
 * Due to CDK attempting to maintain configurable flags - this script is executed after the CDK Deployment
 * This way the SSM Values are created outside of the CDK Stack & modifications can persist
 */

import { APIGatewayClient, GetApiKeyCommand, GetApiKeysCommand, GetRestApisCommand } from '@aws-sdk/client-api-gateway';
import { DescribeSecretCommand, SecretsManagerClient, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { DeleteParametersCommand, GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { unwrap } from 'scripts/helpers';
import { config } from './config';

export const configurableParameters = {
  // On/off
  'config/common/enabled': 'true',
  'config/validation/enabled': 'true',
  'config/processing/enabled': 'true',
  'config/dispatch/enabled': 'true',

  // Processing
  'config/processing/adapter': 'VOID', // Enum: VOID, OneSignal

  // Dispatch
  'config/dispatch/adapter': 'VOID', // Enum: VOID, OneSignal
  'config/dispatch/onesignal/appId': 'placeholder',

  // Common
  'config/common/cache/notificationsProviderRateLimitPerMinute': '5',

  // Circuit breaker config
  'config/dispatch/circuitBreaker/threshold': '5',
  'config/dispatch/circuitBreaker/halfOpenAfter': '30',
  'config/dispatch/circuitBreaker/windowDuration': '60',
  'config/dispatch/circuitBreaker/rateLimitWhenOpen': '5',

  // Default values for url content control within the data
  'content/allowed/protocols': 'govuk:,https:',
  'content/allowed/urlHostnames': '*.gov.uk',
  'notification/deeplinkTemplate': 'govuk://app.gov.uk/notificationcentre/detail?id:{id}',

  // Alert configuration
  'alerts/slack/workspaceId': 'null',
  'alerts/slack/channelId': 'null',

  // Configurations for FLEX - these values are serialized JSON
  'api/flex/apiKey': 'mockApiKey',
  'flex/account': 'null',
  'flex/vpce': 'null',

  // Configurations for UDP - these values are serialized JSON
  'udp/config/sm': 'null',
  'udp/config/kms': 'null',
  'udp/config/role': 'null',
};

const SSM_PARAMETERS_TO_UPDATE = JSON.parse(process.env.SSM_PARAMETERS_TO_UPDATE ?? '{}') as Record<string, string>;

export const parametersForDeletion =  [
  'config/dispatch/onesignal/apiKey'
]

await (async () => {
  const namespace = config.namespace;

  // Iterate keys and set default values if the key does not exist
  const ssmClient = new SSMClient();
  console.log(`Checking SSM Parameter existence`);

  for (const [key, defaultValue] of Object.entries(configurableParameters)) {
    const fullKey = `/${namespace}/${key}`;

    // Attempt to fetch param
    process.stdout.write(`Checking ${fullKey}  `.padEnd(96, ' '));
    const [getParamResult] = await unwrap(
      ssmClient.send(
        new GetParameterCommand({
          Name: fullKey,
          WithDecryption: true,
        })
      )
    );
    if (getParamResult?.Parameter?.Value !== undefined) {
      console.log(` - Exists`);
      // If parameter exists - check if it's in the ENV.SSM_PARAMETERS_TO_UPDATE
      if (SSM_PARAMETERS_TO_UPDATE[key]) {
        console.log(`SSM_PARAMETERS_TO_UPDATE contains entry - updating`);

        const [, putParameterError] = await unwrap(
          ssmClient.send(
            new PutParameterCommand({
              Name: fullKey,
              Value: SSM_PARAMETERS_TO_UPDATE[key],
              Type: 'SecureString',
              Overwrite: true,
              Description: `Note: This parameter has been created post CDK deployment - ${config.env}`,
            })
          )
        );
        if (putParameterError) {
          console.error(` - Failed to update param`);
        } else {
          console.log(` - Param updated`);
        }
      }
    }

    if (getParamResult?.Parameter?.Value === undefined) {
      console.log(` - Does not exists... creating`);
      const [, putParameterError] = await unwrap(
        ssmClient.send(
          new PutParameterCommand({
            Name: fullKey,
            Value: SSM_PARAMETERS_TO_UPDATE[key] ?? defaultValue,
            Type: 'SecureString',
            Overwrite: false,
            Description: `Note: This parameter has been created post CDK deployment - ${config.env}`,
            Tags: Object.entries(config.defaultTags()).map(([Key, Value]) => ({ Key, Value })),
          })
        )
      );
      if (putParameterError) {
        console.error(` - Failed to create param`);
      } else {
        console.log(` - Param created`);
      }
    }
  }

  // Iterate through deletion list and remove parameter if it exists
  const keysToDelete: string[] = [];
  for (const deprecatedKey of parametersForDeletion) {
    const fullKey = `/${namespace}/${deprecatedKey}`;
    try {
      console.log(`Checking if ${deprecatedKey} still exist in namespace.`);
      await ssmClient.send(
        new GetParameterCommand({
          Name: fullKey,
          WithDecryption: true,
        })
      )
      console.log(`Parameter ${deprecatedKey} still exist in namespace.`);
      keysToDelete.push(fullKey);
    } catch (error) {
      if (error instanceof Error && error.name === "ParameterNotFound") {
        return;
      }
      throw error;
    }
  }

  if (keysToDelete) {
    console.log(`Deleting deprecated parameters from namespace.`);
    await ssmClient.send(
      new DeleteParametersCommand({
        Names: keysToDelete
      })
    )
  }

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
        privateApiUrl: `https://${privateApiGw.id}.execute-api.eu-west-2.amazonaws.com/api`,
        roleArn: `arn:aws:iam::${identityResult.Account}:role/${config.utils.namingHelper('iamr-api-gateway', 'flex-private', 'private-invoker')}`,
        region: config.region,
      }),
    })
  );
})();
