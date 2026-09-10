import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ServiceMisconfigurationError } from '@common/models';
import { BaseConfigurableValueService } from '@common/services/baseConfigurableValueService';
import { FeatureFlags } from '@common/services/interfaces/featureFlags';
import { ObservabilityService } from '@common/services/observabilityService';
import { InMemoryTTLCache } from '@common/utils';
import SSMParameters, { ParameterConfig } from '@shared/ssmParameter';

export class ConfigurationService extends BaseConfigurableValueService {
  protected inMemoryCache = new InMemoryTTLCache<string, string>(60000);
  protected prefix = process.env.PREFIX;

  constructor(
    protected client: SSMClient,
    protected observability: ObservabilityService
  ) {
    super(observability);
    this.observability.tracer.captureAWSv3Client(this.client);
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

  private refreshCachePromise: Promise<void> | null = null;

  public async getParameter(namespace: string): Promise<string> {
    this.observability.logger.info(`Retrieving parameter /${this.prefix}/${namespace}`);

    const param = {
      Name: `/${this.prefix}/${namespace}`,
      WithDecryption: true,
    };

    try {
      // If namespace does not contain value - fetch namepsace
      if (!this.inMemoryCache.has(param.Name)) {
        // Persist promise into the class prevent parallel refresh cache calls when cache is empty & lambda has been initialized
        if (this.refreshCachePromise == null) {
          this.refreshCachePromise = this.refreshCache();
          await this.refreshCachePromise;
          this.refreshCachePromise = null;
        } else {
          this.observability.logger.info(`Preventing parallel config fetching`);
          await this.refreshCachePromise;
        }
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

  public async ensureServiceIsEnabled(
    commonConfig: ParameterConfig<'boolean'>,
    stageConfig: ParameterConfig<'boolean'>
  ) {
    for (const config of [commonConfig, stageConfig]) {
      if ((await this.getBooleanParameter(config)) !== true) {
        this.observability.logger.error(`Service is disabled due to parameter ${config.Path} being set to false`);
        throw new ServiceMisconfigurationError();
      }
    }
  }

  public async getFeatureFlags(): Promise<FeatureFlags> {
    const channelControlsFeatureFlag = await this.getBooleanParameter(
      SSMParameters.Config.FeatureFlags.ChannelControls
    );
    const deeplinkUrlFeatureFlag = await this.getBooleanParameter(SSMParameters.Config.FeatureFlags.DeepLinkUrl);
    const messageRetentionFeatureFlag = await this.getBooleanParameter(
      SSMParameters.Config.FeatureFlags.MessageRetention
    );

    return {
      channelControls: channelControlsFeatureFlag,
      deeplinkUrl: deeplinkUrlFeatureFlag,
      messageRetention: messageRetentionFeatureFlag,
    };
  }
}
