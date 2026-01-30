import { Logger } from '@aws-lambda-powertools/logger';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import * as z from 'zod';

export class ConfigurationService {
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

  public async getParameter(namespace: string): Promise<string> {
    this.logger.trace(`Retrieving parameter /${this.prefix}/${namespace}`);

    const param = {
      Name: `/${this.prefix}/${namespace}`,
      WithDecryption: true,
    };

    const command = new GetParameterCommand(param);

    try {
      const data = await this.client.send(command);

      this.logger.trace(`Successfully retrieved parameter /${this.prefix}/${namespace}`);
      if (data.Parameter?.Value) {
        return data.Parameter?.Value;
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
