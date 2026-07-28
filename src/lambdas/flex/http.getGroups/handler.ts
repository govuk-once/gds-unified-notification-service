import {
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { ConfigurationService, ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.array(
  z.object({
    Namespace: z.string(),
    Group: z.string(),
    Subgroup: z.string().optional(),
  })
);

export class GetGroups extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getGroups';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetGroups>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.debug('Received request', {
      path: event.path,
      pushID: event.queryStringParameters?.pushID,
      requestId: context.awsRequestId,
    });

    return {
      body: [],
      statusCode: 200,
    };
  }
}

export const handler = new GetGroups(iocGetConfigurationService(), iocGetObservabilityService(), () => ({})).handler();
