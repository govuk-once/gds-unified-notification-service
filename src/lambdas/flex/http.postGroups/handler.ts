import {
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetGroupStoreDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { GroupActionEnum } from '@common/models';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { GroupStoreDynamoRepository } from '@common/repositories';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { IModifyGroupsSchema } from '@project/lambdas/interfaces';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = IModifyGroupsSchema;
const responseBodySchema = z.any();

/* Lambda Request Example
{
  "headers": {
    "x-api-key": "mockApiKey"
  },
  "requestContext": {
    "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
    "requestTimeEpoch": 1428582896000
  },
  "pathParameters": {
    "pushID": "12342"
  },
  "body": [{
    `Namespace`: `travel`
    `Group`: `spain`,
    `Subgroup`: `DAILY`,
    `Action`: `JOIN`,
  }]
}
*/

export class PostGroups extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'postGroups';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public groupStoreDynamoRepository!: GroupStoreDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<PostGroups>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.debug('Received request', {
      pushID: event.pathParameters?.pushID,
      requestId: context.awsRequestId,
      groups: event.body,
    });

    // Validate
    const pushID = event.pathParameters?.pushID;
    if (!pushID) {
      this.observability.logger.debug('PushID has not been provided - returning 400');
      throw new BadRequestError(['PushID has not been provided']);
    }

    // Leave groups
    await this.groupStoreDynamoRepository.leaveGroups(
      pushID,
      event.body.filter((g) => g.Action === GroupActionEnum.LEAVE)
    );

    // Join Groups
    await this.groupStoreDynamoRepository.joinGroups(
      pushID,
      event.body.filter((g) => g.Action === GroupActionEnum.JOIN)
    );

    // Get users groups to return
    const groups = await this.groupStoreDynamoRepository.getUsersGroups(pushID);

    this.observability.logger.debug('Successful request - returning 204', {
      pushID,
    });

    return {
      body: groups.map(g => {
        return {
          Namespace: g.namespace,
          Group: g.group,
          Subgroup: g.subgroup
        }
      }),
      statusCode: 200,
    };
  }
}

export const handler = new PostGroups(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  groupStoreDynamoRepository: iocGetGroupStoreDynamoRepository(),
})).handler();
