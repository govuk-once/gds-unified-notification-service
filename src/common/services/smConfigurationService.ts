import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { BaseConfigurableValueService } from '@common/services/baseConfigurableValueService';
import { ObservabilityService } from '@common/services/observabilityService';
import { ParameterConfig } from '@shared/ssmParameter';
import z, { ZodType } from 'zod';

export class SMConfigurationService extends BaseConfigurableValueService {
  protected prefix = process.env.PREFIX;

  constructor(
    protected client: SecretsManagerClient,
    protected observability: ObservabilityService
  ) {
    super(observability);
    this.observability.tracer.captureAWSv3Client(this.client);
  }

  protected async getParameterRawValue(secretId: string): Promise<string> {
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

  private async resolveSecret(secret: ParameterConfig, schema?: ZodType, deserialize?: boolean) {
    switch (secret.Type) {
      case 'string':
        return this.getParameterRawValue(secret.Path);
      case 'json':
        return this.getParameter(secret as ParameterConfig<'json'>, schema!, deserialize);
    }
  }

  public async getSecret(secret: ParameterConfig<'string'>): Promise<string>;
  public async getSecret<T extends ZodType>(
    parameter: ParameterConfig<'json'>,
    schema: T,
    deserialize?: boolean
  ): Promise<z.infer<T>>;
  public async getSecret(secret: ParameterConfig, schema?: ZodType, deserialize?: boolean) {
    return this.resolveSecret(secret, schema, deserialize);
  }

  public async getNamespacedSecret(secret: ParameterConfig<'string'>): Promise<string>;
  public async getNamespacedSecret<T extends ZodType>(
    parameter: ParameterConfig<'json'>,
    schema: T,
    deserialize?: boolean
  ): Promise<z.infer<T>>;
  public async getNamespacedSecret(secret: ParameterConfig, schema?: ZodType, deserialize?: boolean) {
    return this.resolveSecret({ Path: `${this.prefix}/${secret.Path}`, Type: secret.Type }, schema, deserialize);
  }
}
