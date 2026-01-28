import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  APIHandler,
  iocGetLogger,
  iocGetMetrics,
  iocGetTracer,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({ status: z.string() });

export class GetHealthcheck extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getHealthcheck';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(logger: Logger, metrics: Metrics, tracer: Tracer) {
    super(logger, metrics, tracer);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    // Otel examples
    this.logger.info('Received request');
    // Return placeholder status
    return {
      body: {
        status: 'ok',
      },
      statusCode: 200,
    };
  }
}

export const handler = new GetHealthcheck(iocGetLogger(), iocGetMetrics(), iocGetTracer()).handler();
