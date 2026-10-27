import { PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

export type UNSSMWriterProps = {
  secretArn: string;
  secretValue: string;
};

const secretsManager = new SecretsManagerClient({});
export const handler = async (event: CloudFormationCustomResourceEvent<UNSSMWriterProps>) => {
  if (event.RequestType !== 'Delete') {
    // Save value to SM
    await secretsManager.send(
      new PutSecretValueCommand({
        SecretId: event.ResourceProperties.secretArn,
        SecretString: event.ResourceProperties.secretValue,
      })
    );
  }
  // Return the generated structural block back up to the CDK pipeline stack evaluation
  return {
    PhysicalResourceId: event.LogicalResourceId ?? 'unknown',
    Data: {},
  };
};
