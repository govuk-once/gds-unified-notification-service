import { Logger } from '@aws-lambda-powertools/logger';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import * as z from 'zod';

export class Configuration {
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

  public async getParameter(namespace: string): Promise<string | undefined> {
    this.logger.trace(`Retrieving parameter /${this.prefix}/${namespace}`);

    const param = {
      Name: `/${this.prefix}/${namespace}`,
      WithDecryption: true,
    };

    const command = new GetParameterCommand(param);

    try {
      const data = await this.client.send(command);

      this.logger.trace(`Successfully retrieved parameter /${this.prefix}/${namespace}`);
      return data.Parameter?.Value;
    } catch (error) {
      this.logger.error(`Failed fetching value from SSM - ${error}`);
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

    if (parameterValue !== undefined) {
      const num = Number(parameterValue);

      if (!Number.isNaN(num)) {
        return num;
      }
    }

    const errorMsg = `Could not parse parameter ${namespace} to a number`;
    this.logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  public async getEnumParameter<T extends z.ZodEnum>(namespace: string, key: string, schema: T): Promise<z.infer<T>> {
    const parameterValue = await this.getParameter(namespace);

    // If parameter is undefined
    if (parameterValue == undefined) {
      throw new Error(`Parameter value ${namespace}/${key} is undefined`);
    }

    // Parse parameter
    const result = schema.safeParse(parameterValue);

    // If invalid enum
    if (result.error) {
      const errorMsg = `Could not parse parameter ${namespace}/${key} to a number`;
      this.logger.trace(errorMsg, {
        method: 'getEnumParameter',
      });
      throw new Error(errorMsg);
    }

    // Return cast value enum
    return result.data as z.infer<T>;
  }
}
