import { DeleteParametersCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { config } from 'infrastructure/cdk/config';

await (async () => {
  //// =====================================================
  // Ephemeral SSM Cleanup
  //// =====================================================
  const ssmClient = new SSMClient({ region: config.region });

  if (config.isEphemeral) {
    console.log(`Deleting ephemeral parameters.`);
    const paramsToDelete = await ssmClient.send(
      new GetParametersByPathCommand({
        Path: `/${config.namespace}/`,
        Recursive: true,
        WithDecryption: true,
      })
    );

    if (paramsToDelete.Parameters && paramsToDelete.Parameters.length > 0) {
      console.log(`Deleting deprecated parameters from namespace.`);
      const params = paramsToDelete.Parameters.map((p) => p.Name).filter((p) => p !== undefined);

      if (params.length === 0) {
        throw new Error('No parameters were found associated with the ephemeral state');
      }

      await ssmClient.send(
        new DeleteParametersCommand({
          Names: params,
        })
      );
    }
  }
})();
