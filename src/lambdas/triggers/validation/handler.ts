import { QueueHandler, type ITypedRequestEvent, type ITypedRequestResponse  } from '@common';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({ status: z.string() });

export class Validation extends QueueHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'validation';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor() {
    super();
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.logger.trace('Lambda triggered');
    return {
      body: {
        status: 'ok',
      },
      statusCode: 200,
    };
  }
}

export const handler = new Validation().handler();
