import {
  APIHandler,
  HandlerDependencies,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({ status: z.string() });

export class GetHealthcheck extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getHealthcheck';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetHealthcheck>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async implementation(
     
    _event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
     
    _context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.info(`Event received`, { _event, _context });
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
