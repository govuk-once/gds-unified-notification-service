import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { iocGetLogger, iocGetMetrics, iocGetTracer } from "@common/ioc";

export class Configuration {
  private client;

  public logger: Logger = iocGetLogger();
  public metrics: Metrics = iocGetMetrics();
  public tracer: Tracer = iocGetTracer();

  constructor() {
    console.log(`Initialized!`);
    this.client = new SSMClient({ region: "eu-west-2" });
  }

  public async getParameter(namespace: string, value: string) {
    const params = {
      Name: `${namespace}/${value}`,
      WithDecryption: true,
    };

    const command = new GetParameterCommand(params);

    try {
      const data = await this.client.send(command)

      return data.Parameter?.Value
    } catch (error) {
      this.logger.trace(`Error: ${error}`);
    }
  }
}
