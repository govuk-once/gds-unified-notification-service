import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { BaseConfigurableValueService } from '@common/services/baseConfigurableValueService';
import { ObservabilityService } from '@common/services/observabilityService';
import { InMemoryTTLCache } from '@common/utils';

export class ConfigurationService extends BaseConfigurableValueService {
  protected inMemoryCache = new InMemoryTTLCache<string, string>(60000);
  protected prefix = process.env.PREFIX;
  private readonly client;

  constructor(protected observability: ObservabilityService) {
    super(observability);
    this.client = new SSMClient({ region: 'eu-west-2' });
  }

  public async refreshCache(nextToken?: string): Promise<void> {
    this.observability.logger.info(`Refreshing namespace ${nextToken}`);
    const params = await this.client.send(
      new GetParametersByPathCommand({
        Path: `/${this.prefix}/`,
        Recursive: true,
        WithDecryption: true,
        MaxResults: 10,
        NextToken: nextToken,
      })
    );

    for (const { Name, Value } of params.Parameters ?? []) {
      if (Name && Value) {
        this.inMemoryCache.set(Name, Value);
      }
    }
    if (params.NextToken) {
      await this.refreshCache(params.NextToken);
    }
  }

  public async getParameter(namespace: string): Promise<string> {
    this.observability.logger.info(`Retrieving parameter /${this.prefix}/${namespace}`);

    const param = {
      Name: `/${this.prefix}/${namespace}`,
      WithDecryption: true,
    };

    try {
      // If namespace does not contain value - fetch namepsace
      if (!this.inMemoryCache.has(param.Name)) {
        await this.refreshCache();
      }

      // Confirm value in cache
      if (this.inMemoryCache.has(param.Name)) {
        this.observability.logger.info(`Successfully retrieved parameter /${this.prefix}/${namespace}`);
        return this.inMemoryCache.get(param.Name)!;
      }

      this.observability.logger.error(`Retrieve parameter /${this.prefix}/${namespace} has no value`);
      throw new ServiceMisconfigurationError();
    } catch (error) {
      this.observability.logger.error('Failed fetching value', {
        paramName: param.Name,
        error: this.observability.formatError(error),
      });
      throw error;
    }
  }

  public async ensureServiceIsEnabled(...keys: string[]) {
    for (const key of keys) {
      if ((await this.getBooleanParameter(key)) !== true) {
        this.observability.logger.error(`Service is disabled due to parameter ${key} being set to false`);
        throw new ServiceMisconfigurationError();
      }
    }
  }
}
