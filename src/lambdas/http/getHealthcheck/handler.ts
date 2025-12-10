import type { Logger } from '@aws-lambda-powertools/logger';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import type { Tracer } from '@aws-lambda-powertools/tracer';
import { APIHandler, type ITypedRequestEvent, type ITypedRequestResponse, ioc } from '@common';
import type { Context } from 'aws-lambda';
import { inject, injectable } from 'tsyringe';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({ status: z.string() });

@injectable()
export class GetHealthcheck extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getHealthcheck';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(
    @inject('Logger') public logger: Logger,
    @inject('Metrics') public metrics: Metrics,
    @inject('Tracer') public tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.logger.trace('Received request');
    return {
      body: {
        status: 'ok',
      },
      statusCode: 200,
    };
  }
}

ioc.register(GetHealthcheck, { useClass: GetHealthcheck });
export const handler = ioc.resolve(GetHealthcheck).handler();
