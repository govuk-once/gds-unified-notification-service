import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { APIHandler, segment, type ITypedRequestEvent, type ITypedRequestResponse } from '@common';
import { CacheService } from '@common/services';
import type { Context } from 'aws-lambda';
import { Axios } from 'axios';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({ status: z.string(), counter: z.number() });

export class GetHealthcheck extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getHealthcheck';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor() {
    super();
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    // let counter = await new CacheService().counter();
    // this.logger.info(`Counter is at: ${counter}`);
    let counter = 0;
    try {
      counter = await (await new CacheService().initialize()).counter();
      this.logger.info(`Counter is now at: ${counter}`);
    } catch (e) {
      this.logger.error(`Err: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

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
        counter,
      },
      statusCode: 200,
    };
  }
}

export const handler = new GetHealthcheck().handler();
