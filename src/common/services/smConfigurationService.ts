import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { BaseConfigurableValueService } from '@common/services/baseConfigurableValueService';
import { ObservabilityService } from '@common/services/observabilityService';

export class SMConfigurationService extends BaseConfigurableValueService {
  constructor(
    protected client: SecretsManagerClient,
    protected observability: ObservabilityService
  ) {
    super(observability);
    this.observability.tracer.captureAWSv3Client(this.client);
  }

  public async getParameter(secretId: string): Promise<string> {
    this.observability.logger.info(`Retrieving secret`, { secretId });
    const secret = await this.client.send(
      new GetSecretValueCommand({
        // Allow the value to be a serialized JSON string
        SecretId: secretId,
      })
    );

    this.observability.logger.info(`Successfully retrieved secret`, { secretId });
    return `${secret.SecretString}`;
  }
}
