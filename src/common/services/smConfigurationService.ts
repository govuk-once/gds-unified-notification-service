import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { BaseConfigurableValueService } from '@common/services/baseConfigurableValueService';
import { ObservabilityService } from '@common/services/observabilityService';

export class SMConfigurationService extends BaseConfigurableValueService {
  private client;
  constructor(protected observability: ObservabilityService) {
    super(observability);
    this.client = new SecretsManagerClient({ region: 'eu-west-2' });
  }

  public async getParameter(namespace: string): Promise<string> {
    this.observability.logger.info(`Namespace`, { namespace });
    const secret = await this.client.send(
      new GetSecretValueCommand({
        // Allow the value to be a serialized JSON string
        SecretId: namespace,
      })
    );

    return `${secret.SecretString}`;
  }
}
