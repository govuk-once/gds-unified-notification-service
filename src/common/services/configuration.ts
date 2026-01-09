import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { iocGetLogger, iocGetMetrics, iocGetTracer } from '@common/ioc';

export class Configuration {
  private client;
  private prefix = process.env.PREFIX;

  public logger: Logger = iocGetLogger();
  public metrics: Metrics = iocGetMetrics();
  public tracer: Tracer = iocGetTracer();

  constructor() {
    this.client = new SSMClient({ region: 'eu-west-2' });
  }

  public async getParameter(namespace: string, key: string): Promise<string | undefined> {
    const param = {
      Name: `/${this.prefix}/${namespace}/${key}`,
      WithDecryption: true,
    };

    const command = new GetParameterCommand(param);

    try {
      const data = await this.client.send(command);

      return data.Parameter?.Value;
    } catch (error) {
      this.logger.trace(`Failed fetching value from SSM: ${error}`);
      throw error;
    }
  }

  public async getBooleanParameter(namespace: string, key: string): Promise<boolean> {
    const parameterValue = await this.getParameter(namespace, key);

    switch (parameterValue?.toLowerCase()) {
      case 'true':
        return true;
      case 'false':
        return false;
      default:
        const errorMsg = `Could not parse parameter ${namespace}/${key} to a boolean`;
        this.logger.trace(errorMsg);
        throw new Error(errorMsg);
    }
  }

  public async getNumericParameter(namespace: string, key: string): Promise<number> {
    const parameterValue = await this.getParameter(namespace, key);

    if (parameterValue !== undefined) {
      const num = Number(parameterValue);

      if (!Number.isNaN(num)) {
        return num;
      }
    }

    const errorMsg = `Could not parse parameter ${namespace}/${key} to a number`;
    this.logger.trace(errorMsg);
    throw new Error(errorMsg);
  }
}
