/**
 * Due to CDK attempting to maintain configurable flags - this script is executed after the CDK Deployment
 * This way the SSM Values are created outside of the CDK Stack & modifications can persist
 */

import { KMSClient, ListAliasesCommand } from '@aws-sdk/client-kms';
import { GetParameterCommand, GetParametersByPathCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { unwrap } from 'scripts/helpers';
import { config } from './config';

const configurableParameters = {
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
  'notification/deeplinkTemplate': 'govuk://app.gov.uk/notificationcentre/,detail?id:{id}',

  // Configurations for FLEX - these values are serialized JSON
  'api/flex/apiKey': 'mockApiKey',
  'flex/account': 'null',
  'flex/vpce': 'null',

  // Configurations for UDP - these values are serialized JSON
  'udp/config/sm': 'null',
  'udp/config/kms': 'null',
  'udp/config/role': 'null',
};

const ssm = new SSMClient();
const kms = new KMSClient();

await (async () => {
  const namespace = config.utils.namespace();
  const aliases = await kms.send(new ListAliasesCommand({}));
  const alias = aliases.Aliases?.find((alias) =>
    alias.AliasArn?.endsWith(config.utils.namingHelper('kms', 'key', 'alias'))
  );

  if (alias == undefined) {
    console.error(`KMS Key not found - aborting`);
    return;
  }

  // Iterate keys and set default values if the key does not exist
  const ssmClient = new SSMClient();
  console.log(`Checking SSM Parameter existence`);

  for (const [key, defaultValue] of Object.entries(configurableParameters)) {
    const fullKey = `/${namespace}/external/${key}`;

    // Attempt to fetch param
    console.log(`Fetching ${fullKey}`);
    const [getParamResult, getParameterError] = await unwrap(
      ssmClient.send(
        new GetParameterCommand({
          Name: fullKey,
          WithDecryption: true,
        })
      )
    );

    if (getParamResult?.Parameter?.Value === undefined) {
      console.log(`Param ${fullKey} does not exist - creating`);
      const [putParameterResult, putParameterError] = await unwrap(
        ssmClient.send(
          new PutParameterCommand({
            Name: fullKey,
            Value: defaultValue,
            Type: 'SecureString',
            Overwrite: false,
            KeyId: alias.AliasName,
          })
        )
      );
      if (putParameterError) {
        console.error(` - Failed to create param ${fullKey}`);
      } else {
        console.log(` - Param created`);
      }
    }
  }

  // Detect any keys not defined in /env/external/ namespace
  let nextToken: string | undefined | -1 = -1;
  const existingKeysInNamespace: string[] = [];
  while (nextToken == -1 && nextToken !== undefined) {
    const [params, errors] = await unwrap(
      ssm.send(
        new GetParametersByPathCommand({
          Path: `/${namespace}/external/`,
          Recursive: true,
          WithDecryption: true,
        })
      )
    );
    nextToken = params?.NextToken == undefined ? undefined : params.NextToken;
    existingKeysInNamespace.push(
      ...(params?.Parameters?.map((p) => p.Name!.replace(`/${namespace}/external/`, '')) ?? [])
    );
  }

  const depracatedKeys = existingKeysInNamespace.filter(
    (param) => Object.keys(configurableParameters).includes(param) === false
  );
  for (const key of depracatedKeys) {
    console.log(`${key} is no longer defined by this script, and should be manually removed`);
  }
})();
