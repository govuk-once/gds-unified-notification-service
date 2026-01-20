import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

export class Configuration {
  private client;
  private prefix = process.env.PREFIX;

  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer
  ) {
    this.client = new SSMClient({ region: 'eu-west-2' });
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
}
