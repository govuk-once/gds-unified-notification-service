/**
 * Due to CDK attempting to maintain configurable flags - this script is executed after the CDK Deployment
 * This way the SSM Values are created outside of the CDK Stack & modifications can persist
 */

import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
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
  'config/dispatch/onesignal/apiKey': 'placeholder',
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

  // Configurations for FLEX - these values are serialized JSON
  'api/flex/apiKey': 'mockApiKey',
  'flex/account': 'null',
  'flex/vpce': 'null',

  // Configurations for UDP - these values are serialized JSON
  'udp/config/sm': 'null',
  'udp/config/kms': 'null',
  'udp/config/role': 'null',
};

await (async () => {
  const namespace = config.namespace;

  // Iterate keys and set default values if the key does not exist
  const ssmClient = new SSMClient();
  console.log(`Checking SSM Parameter existence`);

  for (const [key, defaultValue] of Object.entries(configurableParameters)) {
    const fullKey = `/${namespace}/${key}`;

    // Attempt to fetch param
    process.stdout.write(`Checking ${fullKey}  `.padEnd(96, ' '));
    const [getParamResult, getParameterError] = await unwrap(
      ssmClient.send(
        new GetParameterCommand({
          Name: fullKey,
          WithDecryption: true,
        })
      )
    );
    if (getParamResult?.Parameter?.Value !== undefined) {
      console.log(` - Exists`);
    }

    if (getParamResult?.Parameter?.Value === undefined) {
      console.log(` - Does not exists... creating`);
      const [putParameterResult, putParameterError] = await unwrap(
        ssmClient.send(
          new PutParameterCommand({
            Name: fullKey,
            Value: defaultValue,
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
})();
