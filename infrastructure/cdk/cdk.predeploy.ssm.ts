/**
 * Due to CDK attempting to maintain configurable flags - this script is executed after the CDK Deployment
 * This way the SSM Values are created outside of the CDK Stack & modifications can persist
 */

import { DeleteParametersCommand, GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import SSMParameters, { getParametersConfig } from '@shared/ssmParameter';
import { unwrap } from 'scripts/helpers';
import { config } from './config';

export const configurableParameters = getParametersConfig(SSMParameters).filter((p) => p.Default);

const SSM_PARAMETERS_TO_UPDATE = JSON.parse(process.env.SSM_PARAMETERS_TO_UPDATE ?? '{}') as Record<string, string>;

export const parametersForDeletion = ['config/dispatch/onesignal/apiKey'];

await (async () => {
  const namespace = config.namespace;

  // Iterate keys and set default values if the key does not exist
  const ssmClient = new SSMClient();
  console.log(`Checking SSM Parameter existence`);

  for (const parameter of configurableParameters) {
    const fullKey = `/${namespace}/${parameter.Path}`;

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
      if (SSM_PARAMETERS_TO_UPDATE[parameter.Path]) {
        console.log(`SSM_PARAMETERS_TO_UPDATE contains entry - updating`);

        const [, putParameterError] = await unwrap(
          ssmClient.send(
            new PutParameterCommand({
              Name: fullKey,
              Value: SSM_PARAMETERS_TO_UPDATE[parameter.Path],
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
            Value: SSM_PARAMETERS_TO_UPDATE[parameter.Path] ?? parameter.Default,
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
