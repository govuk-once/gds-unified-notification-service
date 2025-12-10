import { APIHandler, type ITypedRequestEvent, type ITypedRequestResponse } from '@common';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({ status: z.string() });

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
    this.logger.trace('Received request');
    return {
      body: {
        status: 'ok',
      },
      statusCode: 200,
    };
  }
}

export const handler = new GetHealthcheck().handler();
