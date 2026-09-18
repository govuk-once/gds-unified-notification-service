import { DeleteParametersCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { config } from 'infrastructure/cdk/config';

const deleteParametersInNamespace = async (ssmClient: SSMClient, nextToken?: string) => {
  const params = await ssmClient.send(
    new GetParametersByPathCommand({
      Path: `/${config.namespace}/`,
      Recursive: true,
      WithDecryption: true,
      MaxResults: 10,
      NextToken: nextToken,
    })
  );

  if (!params.Parameters) {
    throw new Error('No parameters were found associated with the ephemeral state');
  }

  const paramsToDelete = params.Parameters.map((p) => p.Name).filter((p) => p !== undefined);
  await ssmClient.send(
    new DeleteParametersCommand({
      Names: paramsToDelete,
    })
  );

  if (params.NextToken) {
    await deleteParametersInNamespace(ssmClient, params.NextToken);
  }
};

await (async () => {
  //// =====================================================
  // Ephemeral SSM Cleanup
  //// =====================================================

  if (config.isEphemeral) {
    console.log(`Deleting ephemeral parameters.`);

    const ssmClient = new SSMClient({ region: config.region });

    await deleteParametersInNamespace(ssmClient);
  } else {
    console.log(`This environment is not ephemeral.`);
  }
})();
