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

const responseBodySchema = z.any();
const requestBodySchema = z.array(
  z.object({
    Namespace: z.string(),
    Group: z.string(),
    Subgroup: z.string().optional(),
    Action: z.enum(['JOIN', 'LEAVE']),
  })
);

export class ModifyGroups extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'modifyGroups';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<ModifyGroups>
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

export const handler = new ModifyGroups(
  iocGetConfigurationService(),
  iocGetObservabilityService(),
  () => ({})
).handler();
