import { Logger } from '@aws-lambda-powertools/logger';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { InMemoryTTLCache } from '@common/utils';
import * as z from 'zod';

export class ConfigurationService {
  // SSM Parameters should refresh every 60s
  private inMemoryCache = new InMemoryTTLCache<string, string>(60000);

  private client;
  private prefix = process.env.PREFIX;
  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer
  ) {
    this.client = new SSMClient({ region: 'eu-west-2' });
    // TODO: Fix tests
    // this.tracer.captureAWSv3Client(this.client);
  }

  public async fetchNamespace(nextToken?: string): Promise<void> {
    this.logger.info(`Refreshing namespace ${nextToken}`);
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
      await this.fetchNamespace(params.NextToken);
    }
  }

  public async getParameter(namespace: string): Promise<string> {
    this.logger.trace(`Retrieving parameter /${this.prefix}/${namespace}`);

    const param = {
      Name: `/${this.prefix}/${namespace}`,
      WithDecryption: true,
    };

    try {
      // If namespace does not contain value - fetch namepsace
      if (this.inMemoryCache.has(param.Name) == false) {
        await this.fetchNamespace();
      }

      // Confirm value in cache
      if (this.inMemoryCache.has(param.Name)) {
        this.logger.trace(`Successfully retrieved parameter /${this.prefix}/${namespace}`);
        return this.inMemoryCache.get(param.Name)!;
      }
      throw new Error('Returned parameter has no value');
    } catch (error) {
      this.logger.error(`Failed fetching value from SSM - ${param.Name} ${error}`);
      throw error;
    }
  }

  public async getBooleanParameter(namespace: string): Promise<boolean> {
    const parameterValue = await this.getParameter(namespace);

    switch (parameterValue?.toLowerCase()) {
      case 'true':
        return true;
      case 'false':
        return false;
      default:
        const errorMsg = `Could not parse parameter ${namespace} to a boolean`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
    }
  }

  public async getNumericParameter(namespace: string): Promise<number> {
    const parameterValue = await this.getParameter(namespace);

    const num = Number(parameterValue);
    if (!Number.isNaN(num)) {
      return num;
    }

    const errorMsg = `Could not parse parameter ${namespace} to a number`;
    this.logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  public async getEnumParameter<T extends z.ZodEnum>(namespace: string, schema: T): Promise<z.infer<T>> {
    const parameterValue = await this.getParameter(namespace);

    // Parse parameter
    const result = schema.safeParse(parameterValue);

    // If invalid enum
    if (result.error) {
      const errorMsg = `Could not parse parameter ${namespace} to a enum`;
      this.logger.error(errorMsg, {
        method: 'getEnumParameter',
      });
      throw new Error(errorMsg);
    }

    // Return cast value enum
    return result.data as z.infer<T>;
  }

  public async ensureServiceIsEnabled(...keys: string[]) {
    for (const key of keys) {
      if ((await this.getBooleanParameter(key)) !== true) {
        throw new Error(`Function disabled due to ${keys.join(' or ')} SSM param being toggled off`);
      }
    }
  }
}
