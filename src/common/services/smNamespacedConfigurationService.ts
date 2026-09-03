import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ObservabilityService } from '@common/services/observabilityService';
import { SMConfigurationService } from '@common/services/smConfigurationService';

export class SMNamespacedConfigurationService extends SMConfigurationService {
  protected prefix = process.env.PREFIX;

  constructor(
    client: SecretsManagerClient,
    protected observability: ObservabilityService
  ) {
    super(client, observability);
  }

  public async getParameter(secretId: string): Promise<string> {
    return await super.getParameter(`${this.prefix}/${secretId}`);
  }
}
