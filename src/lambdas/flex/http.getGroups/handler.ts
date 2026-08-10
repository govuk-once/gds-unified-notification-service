import {
  GroupStoreDynamoRepository,
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetGroupStoreDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
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

  public groupStoreDynamoRepository!: GroupStoreDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetGroups>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.debug('Received request', {
      path: event.path,
      pushID: event.queryStringParameters?.pushID,
      requestId: context.awsRequestId,
    });

    // Validate
    const pushID = event.queryStringParameters?.pushID;
    if (!pushID) {
      this.observability.logger.debug('pushID has not been provided - returning 400');
      throw new BadRequestError(['pushID has not been provided']);
    }

    // Get users groups to return
    const groups = await this.groupStoreDynamoRepository.getUsersGroups(pushID);

    this.observability.logger.debug('Successful request - returning 200', {
      pushID,
    });

    return {
      body: groups.map((g) => {
        return {
          Namespace: g.Namespace,
          Group: g.Group,
          Subgroup: g.Subgroup,
        };
      }),
      statusCode: 200,
    };
  }
}

export const handler = new GetGroups(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  groupStoreDynamoRepository: iocGetGroupStoreDynamoRepository(),
})).handler();
