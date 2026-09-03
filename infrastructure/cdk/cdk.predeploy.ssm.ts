/**
 * Due to CDK attempting to maintain configurable flags - this script is executed after the CDK Deployment
 * This way the SSM Values are created outside of the CDK Stack & modifications can persist
 */

import { DeleteParametersCommand, GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { unwrap } from 'scripts/helpers';
import { config } from './config';

export const configurableParameters = {
  // On/off
  'config/common/enabled': 'true',
  'config/validation/enabled': 'true',
  'config/processing/enabled': 'true',
  'config/groupProcessingWorker/enabled': 'true',
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

  // Feature Flags
  'config/featureFlag/deeplinkUrl': String(config.featureFlag.deeplinkUrl),
  'config/featureFlag/messageRetention': String(config.featureFlag.messageRetention),
  'config/featureFlag/channelControls': String(config.featureFlag.channelControls),

  // Default values for url content control within the data
  'content/allowed/protocols': 'govuk:,https:',
  'content/allowed/urlHostnames': '*.gov.uk',
  'notification/deeplinkTemplate': 'govuk://app.gov.uk/notificationcentre/detail?id:{id}',

  // Alert configuration
  'alerts/slack/workspaceId': 'null',
  'alerts/slack/channelId': 'null',

  // Group Notifications
  'group/dispatch/workerCount': '5',
  'group/dispatch/workerBatchSize': '100',

  // AccountId for consumer to generate certificates for
  'certificate/consumers': '{}',

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

export const parametersForDeletion = ['config/dispatch/onesignal/apiKey'];

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
      );
      console.log(`Parameter ${deprecatedKey} still exist in namespace.`);
      keysToDelete.push(fullKey);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'ParameterNotFound')) {
        throw error;
      }
    }
  }

  if (keysToDelete.length > 0) {
    console.log(`Deleting deprecated parameters from namespace.`);
    await ssmClient.send(
      new DeleteParametersCommand({
        Names: keysToDelete,
      })
    );
  }
})();
