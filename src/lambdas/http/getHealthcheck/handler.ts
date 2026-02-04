import { APIHandler, iocGetObservabilityService, type ITypedRequestEvent, type ITypedRequestResponse } from '@common';
import { ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({ status: z.string() });

export class GetHealthcheck extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getHealthcheck';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(protected observability: ObservabilityService) {
    super(observability);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    // Otel examples
    this.observability.logger.info('Received request');
    // Return placeholder status
    return {
      body: {
        status: 'ok',
      },
      statusCode: 200,
    };
  }
}

export const handler = new GetHealthcheck(iocGetObservabilityService()).handler();
