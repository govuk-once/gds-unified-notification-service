import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  APIHandler,
  iocGetLogger,
  iocGetMetrics,
  iocGetTracer,
  segment,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import type { Context } from 'aws-lambda';
import { Axios } from 'axios';
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

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    // Otel examples
    this.logger.info('Received request');
    this.metrics.addMetric('requests-received', MetricUnit.Count, 1);
    this.tracer.putAnnotation('annotation', true);

    // Custom segment example - make an API call, expect failure
    try {
      const status = await segment(this.tracer, '### my handler content', async () => {
        const request = await new Axios().get('http://localhost/404');
        return request.status;
      });
      this.tracer.putMetadata('successful status', {
        status: status,
      });
    } catch (e) {
      this.tracer.putMetadata('failed request', {
        error: e,
      });
    }

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
